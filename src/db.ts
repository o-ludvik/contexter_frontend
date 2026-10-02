// Minimal promise wrapper around IndexedDB.
// Stores: kv (misc settings/secrets, out-of-line keys), files (keyPath 'path'), appends (pending idea entries).
const DB_NAME = 'contexter';
const DB_VERSION = 1;
export type StoreName = 'kv' | 'files' | 'appends';

let dbp: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('appends')) db.createObjectStore('appends', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return wrap((await store(name, 'readonly')).get(key));
}

export async function getAll<T>(name: StoreName): Promise<T[]> {
  return wrap((await store(name, 'readonly')).getAll());
}

export async function put(name: StoreName, value: unknown, key?: IDBValidKey): Promise<IDBValidKey> {
  return wrap((await store(name, 'readwrite')).put(value, key));
}

export async function del(name: StoreName, key: IDBValidKey): Promise<void> {
  await wrap((await store(name, 'readwrite')).delete(key));
}

export async function clear(name: StoreName): Promise<void> {
  await wrap((await store(name, 'readwrite')).clear());
}
