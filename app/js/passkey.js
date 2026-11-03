// Face ID through a passkey (WebAuthn). The passkey lives in her Passwords app.
// Its PRF feature gives back the same secret each time Face ID succeeds, and
// that secret unlocks her data key. No server is involved: the app only needs the secret.

import { randomBytes } from './crypto.js';

// reason: a short code shown on screen, to help work out what happened
export class NoPrfError extends Error {
  constructor(reason) {
    super('This passkey cannot give the app its secret');
    this.reason = reason;
  }
}

export const passkeysAvailable = () => !!window.PublicKeyCredential;

// Create the passkey. Some phones hand back the secret straight away; others only
// when the passkey is first used, so secret may be null (see passkeySecret).
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
  const first = prf?.results?.first;
  return {
    credId: new Uint8Array(cred.rawId),
    secret: first ? new Uint8Array(first) : null,
    // false means the passkey said it can't do PRF; undefined means it didn't say
    prfEnabled: prf?.enabled,
  };
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
  if (!first) throw new NoPrfError('no-secret-on-use');
  return new Uint8Array(first);
}
