// IndexedDB: the database built into Safari, stored only on the phone.
// Every read and write goes through here, so encryption can be added in one place later.

const DB_NAME = 'apothecary';
// Version 2 added a 'keys' store during a brief security trial; version 3 added 'settings'.
// Safari refuses to open a database at a lower version than the phone has,
// so this must never go back down.
const DB_VERSION = 3;
export const STORES = ['meds', 'entries', 'settings'];

let dbPromise;

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

// Encrypted records (shape { id, iv, data }) from the brief security trial can't be
// read yet, so they stay hidden until encryption returns
export const getAll = async (store) => (await run(store, 'readonly', (s) => s.getAll())).filter((r) => !r.iv);
export const put = (store, record) => run(store, 'readwrite', (s) => s.put(record));
export const remove = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
