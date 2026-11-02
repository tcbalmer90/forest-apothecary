// IndexedDB: the database built into Safari, stored only on the phone.
// Every read and write goes through here, so Stage 3 can add encryption in one place.

const DB_NAME = 'apothecary';
const DB_VERSION = 1;
export const STORES = ['meds', 'entries'];

let dbPromise;

function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
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

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, record) => run(store, 'readwrite', (s) => s.put(record));
export const remove = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
