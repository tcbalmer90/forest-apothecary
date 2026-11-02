// The vault: the locked copies of her data key, and unlocking them.
// The vault record holds no health information: only salts and sealed keys.
//
// { id: 'vault', mode: 'faceid' | 'phrase', credId, prfSalt, byFaceId, phraseSalt, iterations, byPhrase }

import * as db from './db.js';
import {
  randomBytes, newDataKeyBytes, importDataKey, keyFromPrf, keyFromPhrase, seal, unseal, PHRASE_ITERATIONS,
} from './crypto.js';
import { createPasskey, passkeySecret } from './passkey.js';

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

async function faceIdSeal() {
  const prfSalt = randomBytes(32);
  const { credId, secret } = await createPasskey(prfSalt);
  return { mode: 'faceid', credId, prfSalt, byFaceId: await seal(await keyFromPrf(secret, prfSalt), dataKeyBytes) };
}

// First set-up, in two parts. Face ID comes first, so a refusal is found
// before she writes anything down. Nothing is saved until finishVault.
export async function prepareFaceId() {
  dataKeyBytes = newDataKeyBytes();
  return faceIdSeal();
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

// While unlocked: replace the Face ID passkey (e.g. after a phrase unlock)
export async function renewFaceId() {
  const vault = await loadVault();
  await db.putVault({ ...vault, ...(await faceIdSeal()) });
}

// While unlocked: replace the recovery phrase
export async function renewPhrase(phrase) {
  const vault = await loadVault();
  await db.putVault({ ...vault, ...(await phraseSeal(phrase)) });
}
