// Face ID through a passkey (WebAuthn). The passkey lives in her iCloud Keychain.
// Its PRF feature gives back the same secret each time Face ID succeeds, and
// that secret unlocks her data key. No server is involved: the app only needs the secret.

import { randomBytes } from './crypto.js';

export class NoPrfError extends Error {}

export const passkeysAvailable = () => !!window.PublicKeyCredential;

// Create the passkey and get its secret (may ask for Face ID twice on some phones)
export async function createPasskey(prfSalt) {
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Apothecary', id: location.hostname },
      user: { id: randomBytes(16), name: 'Apothecary', displayName: 'Apothecary' },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const prf = cred.getClientExtensionResults().prf;
  if (!prf?.enabled) throw new NoPrfError('This phone cannot use Face ID for this app');
  const credId = new Uint8Array(cred.rawId);
  const secret = prf.results?.first ? new Uint8Array(prf.results.first) : await passkeySecret(credId, prfSalt);
  return { credId, secret };
}

// Ask for Face ID and get the passkey's secret
export async function passkeySecret(credId, prfSalt) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: credId }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const first = cred.getClientExtensionResults().prf?.results?.first;
  if (!first) throw new NoPrfError('Face ID did not return a secret');
  return new Uint8Array(first);
}
