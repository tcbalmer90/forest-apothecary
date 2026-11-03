// Encryption, using only what is built into Safari (Web Crypto).
//
// One random "data key" encrypts every record with AES-GCM.
// The data key itself is locked ("sealed") twice:
//   - with a key from Face ID (the passkey's PRF secret), for everyday unlocking
//   - with a key from the recovery phrase, for a new phone or if Face ID stops working

import { WORDS } from './words.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

// Deliberately slow, so guessing phrases would take far too long
export const PHRASE_ITERATIONS = 600000;

// ---------- The data key ----------

export const newDataKeyBytes = () => randomBytes(32);

export function importDataKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(key, value) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv, data };
}

export async function decryptJSON(key, { iv, data }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(dec.decode(plain));
}

// ---------- Keys that lock the data key ----------

// From Face ID: the passkey hands back a secret only after her face is recognised
export async function keyFromPrf(prfSecret, salt) {
  const base = await crypto.subtle.importKey('raw', prfSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('apothecary face id') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

// From the recovery phrase
export async function keyFromPhrase(phrase, salt, iterations = PHRASE_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalisePhrase(phrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function seal(lockKey, bytes) {
  const iv = randomBytes(12);
  return { iv, data: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, lockKey, bytes) };
}

export async function unseal(lockKey, { iv, data }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, lockKey, data));
}

// ---------- Bytes as text, for backup files ----------

export function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const sealedToText = ({ iv, data }) => ({ iv: toBase64(iv), data: toBase64(data) });
const sealedFromText = ({ iv, data }) => ({ iv: fromBase64(iv), data: fromBase64(data) });
export { sealedToText, sealedFromText };

// ---------- Recovery phrase ----------

// 12 words, each picked fairly from 256 (one random byte each)
export function newPhrase() {
  return [...randomBytes(12)].map((b) => WORDS[b]).join(' ');
}

export function normalisePhrase(phrase) {
  return phrase.toLowerCase().trim().split(/[\s,.-]+/).filter(Boolean).join(' ');
}

// Words she typed that aren't on the list (likely typos)
export function unknownWords(phrase) {
  return normalisePhrase(phrase).split(' ').filter((w) => w && !WORDS.includes(w));
}
