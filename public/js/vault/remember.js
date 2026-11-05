// Remembers an unlocked session across reloads for a limited time.
// The data key is stored in IndexedDB as a non-extractable CryptoKey: the browser keeps it
// usable for encrypt/decrypt but its bytes can never be read back, and the code is never stored.
const DB_NAME = 'spese-vault';
const STORE = 'session';
const RECORD = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const rememberSession = ({ uid, key }, hours) =>
  run('readwrite', (store) => store.put({ uid, key, expiresAt: Date.now() + hours * 3_600_000 }, RECORD));

export const forgetSession = () => run('readwrite', (store) => store.delete(RECORD)).catch(() => {});

// The stored session, or null when there is none or it has expired (an expired one is removed).
export async function recallSession() {
  const record = await run('readonly', (store) => store.get(RECORD)).catch(() => null);
  if (!record) return null;
  if (!(record.expiresAt > Date.now()) || !(record.key instanceof CryptoKey)) {
    await forgetSession();
    return null;
  }
  return record;
}
