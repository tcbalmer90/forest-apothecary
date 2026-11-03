// The vault: the locked copies of her data key, and unlocking them.
// The vault record holds no health information: only salts and sealed keys.
//
// { id: 'vault', mode: 'faceid' | 'phrase', credId, prfSalt, byFaceId, phraseSalt, iterations, byPhrase }

import * as db from './db.js';
import {
  randomBytes, newDataKeyBytes, importDataKey, keyFromPrf, keyFromPhrase, seal, unseal, PHRASE_ITERATIONS,
  sealedToText, sealedFromText, toBase64, fromBase64,
} from './crypto.js';
import { createPasskey, passkeySecret, NoPrfError } from './passkey.js';

let dataKeyBytes = null; // kept only in memory, only while unlocked

export const loadVault = () => db.getVault();

async function open(bytes) {
  dataKeyBytes = bytes;
  db.setKey(await importDataKey(bytes));
}

async function phraseSeal(phrase) {
  const phraseSalt = randomBytes(16);
  const lockKey = await keyFromPhrase(phrase, phraseSalt, PHRASE_ITERATIONS);
  return { phraseSalt, iterations: PHRASE_ITERATIONS, byPhrase: await seal(lockKey, dataKeyBytes) };
}

// askTap(fn) runs fn after a fresh tap. Some phones only give the secret when the new
// passkey is first used, and iPhones want a tap before each Face ID request.
const now = (fn) => fn();

async function faceIdSeal(askTap = now) {
  const prfSalt = randomBytes(32);
  const { credId, secret, prfEnabled } = await createPasskey(prfSalt);
  let key = secret;
  if (!key) {
    try {
      key = await askTap(() => passkeySecret(credId, prfSalt));
    } catch (e) {
      if (e instanceof NoPrfError && prfEnabled === false) e.reason = 'prf-not-supported';
      throw e;
    }
  }
  return { mode: 'faceid', credId, prfSalt, byFaceId: await seal(await keyFromPrf(key, prfSalt), dataKeyBytes) };
}

// First set-up, in two parts. Face ID comes first, so a refusal is found
// before she writes anything down. Nothing is saved until finishVault.
export async function prepareFaceId(askTap) {
  dataKeyBytes = newDataKeyBytes();
  return faceIdSeal(askTap);
}

export async function finishVault(face, phrase) {
  const vault = { id: 'vault', ...face, ...(await phraseSeal(phrase)) };
  await db.putVault(vault);
  await open(dataKeyBytes);
  await db.encryptLeftovers();
}

export async function startPhraseOnly() {
  dataKeyBytes = newDataKeyBytes();
  return { mode: 'phrase' };
}

export async function unlockWithFaceId(vault) {
  const secret = await passkeySecret(vault.credId, vault.prfSalt);
  await open(await unseal(await keyFromPrf(secret, vault.prfSalt), vault.byFaceId));
}

// Throws if the phrase is wrong (AES-GCM refuses to open with the wrong key)
export async function unlockWithPhrase(vault, phrase) {
  const lockKey = await keyFromPhrase(phrase, vault.phraseSalt, vault.iterations);
  await open(await unseal(lockKey, vault.byPhrase));
}

// ---------- Backups ----------
// A backup carries the phrase-sealed copy of her data key, so the phrase alone opens it.

export async function backupLock() {
  const v = await loadVault();
  return { phraseSalt: toBase64(v.phraseSalt), iterations: v.iterations, byPhrase: sealedToText(v.byPhrase) };
}

// The data key inside a backup, if the phrase is right (otherwise this throws)
export async function keyFromBackup(lock, phrase) {
  const lockKey = await keyFromPhrase(phrase, fromBase64(lock.phraseSalt), lock.iterations);
  return unseal(lockKey, sealedFromText(lock.byPhrase));
}

// First set-up from a backup: keep the backup's key and phrase, add Face ID if possible
export async function adoptBackupKey(keyBytes, lock, { faceId, askTap }) {
  dataKeyBytes = keyBytes;
  const face = faceId ? await faceIdSeal(askTap) : { mode: 'phrase' };
  await db.putVault({
    id: 'vault',
    ...face,
    phraseSalt: fromBase64(lock.phraseSalt),
    iterations: lock.iterations,
    byPhrase: sealedFromText(lock.byPhrase),
  });
  await open(keyBytes);
}

// While unlocked: replace the Face ID passkey (e.g. after a phrase unlock)
export async function renewFaceId(askTap) {
  const vault = await loadVault();
  await db.putVault({ ...vault, ...(await faceIdSeal(askTap)) });
}

// While unlocked: replace the recovery phrase
export async function renewPhrase(phrase) {
  const vault = await loadVault();
  await db.putVault({ ...vault, ...(await phraseSeal(phrase)) });
}
