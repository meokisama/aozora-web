/**
 * IndexedDB for reading state, bookmarks, and annotations — replaces the desktop
 * app's SQLite `library.db`. Distinct from the parsed-book cache in `lib/reader-cache.ts`.
 */

const DB_NAME = "aozora-web";
const DB_VERSION = 3;

export const STORE_PROGRESS = "progress";
export const STORE_BOOKMARKS = "bookmarks";
export const STORE_ANNOTATIONS = "annotations";
/** Library book records (metadata + progress), keyed by book id. */
export const STORE_BOOKS = "books";
/** Imported (local) epub blobs; host books never land here. */
export const STORE_BOOKBLOBS = "bookblobs";
/** Reading sessions for stats, indexed by bookId. */
export const STORE_SESSIONS = "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // progress: out-of-line keys (keyed by book id).
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) db.createObjectStore(STORE_PROGRESS);
      // bookmarks / annotations / sessions: keyed by id, with a bookId index.
      for (const name of [STORE_BOOKMARKS, STORE_ANNOTATIONS, STORE_SESSIONS]) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          store.createIndex("bookId", "bookId", { unique: false });
        }
      }
      // books: keyed by id. bookblobs: out-of-line, keyed by book id.
      if (!db.objectStoreNames.contains(STORE_BOOKS)) db.createObjectStore(STORE_BOOKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_BOOKBLOBS)) db.createObjectStore(STORE_BOOKBLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// --- Out-of-line key access (progress store). -------------------------------

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Keyed-record access (bookmarks / annotations, keyPath "id"). -----------

/** Every record in a keyPath store. */
export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

/** All records whose indexed field equals `value` (e.g. a book's bookmarks). */
export async function idbGetAllByIndex<T>(store: string, index: string, value: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetRecord<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Puts a record into a keyPath store (key comes from the value's `id`). */
export async function idbPutRecord(store: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
