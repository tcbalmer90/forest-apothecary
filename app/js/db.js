// IndexedDB: the database built into Safari, stored only on the phone.
// Every record is encrypted before it is stored: on disk it is just
// { id, iv, data } where data is unreadable without her key.

import { encryptJSON, decryptJSON } from './crypto.js';

const DB_NAME = 'apothecary';
const DB_VERSION = 2;
export const STORES = ['meds', 'entries'];

let dbPromise;
let key = null; // her data key, only while unlocked

export function setKey(k) { key = k; }

function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of [...STORES, 'keys']) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

function needKey() {
  if (!key) throw new Error('Locked');
}

export async function getAll(store) {
  needKey();
  const rows = await run(store, 'readonly', (s) => s.getAll());
  return Promise.all(rows.map((r) => decryptJSON(key, r)));
}

export async function put(store, record) {
  needKey();
  const { iv, data } = await encryptJSON(key, record);
  return run(store, 'readwrite', (s) => s.put({ id: record.id, iv, data }));
}

export const remove = (store, id) => run(store, 'readwrite', (s) => s.delete(id));

// The vault holds sealed keys, never health information, so it is stored as is
export const getVault = () => run('keys', 'readonly', (s) => s.get('vault'));
export const putVault = (vault) => run('keys', 'readwrite', (s) => s.put(vault));

// Entries saved before Stage 3 were not encrypted: encrypt them now
export async function encryptLeftovers() {
  needKey();
  for (const store of STORES) {
    const rows = await run(store, 'readonly', (s) => s.getAll());
    for (const row of rows.filter((r) => !r.iv)) await put(store, row);
  }
}
