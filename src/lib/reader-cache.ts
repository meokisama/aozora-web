/**
 * IndexedDB cache for parsed EPUB content. Derived, re-creatable data, so it
 * lives in the renderer rather than the main-process source of truth.
 *
 * Host-served books carry a per-book key (from the token endpoint); their cache
 * entry is stored AES-256-GCM **encrypted** so the fully-parsed, readable book
 * can't just be exported from DevTools → Application → IndexedDB. Books without
 * a key (absolute/external URLs, already public) are stored as plain objects.
 */

import type { ParsedBook } from "@/lib/epub/parse-book";
import { aesGcmEncrypt, aesGcmDecrypt } from "@/lib/crypto";

const DB_NAME = "aozora-reader";
const STORE = "books";
// v3: added renditionSpread (book-level OPF spread mode) for the fixed-layout viewer.
// v4: added title (dc:title) so the reader can show the real book title in the browser tab.
// v5: cache entries for host books are now encrypted (stored as a Blob).
// Pre-release policy is forward-only — drop the old cache rather than migrate, so
// previously-opened books re-parse and pick up the new fields/format.
const DB_VERSION = 5;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx<T = unknown>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request ? (request.result as T) : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

interface BlobManifestEntry {
  key: string;
  type: string;
  len: number;
}

/** Flattens a ParsedBook (including its image Blobs) into one byte buffer:
 *  `[u32 metaLen][meta JSON][blob bytes…]`, meta carrying every non-blob field
 *  plus a manifest describing where each blob sits. */
async function encodeParsed(parsed: ParsedBook): Promise<Uint8Array> {
  const manifest: BlobManifestEntry[] = [];
  const chunks: Uint8Array[] = [];
  for (const [key, blob] of Object.entries(parsed.blobs)) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    manifest.push({ key, type: blob.type, len: bytes.byteLength });
    chunks.push(bytes);
  }
  const rest: Record<string, unknown> = { ...parsed };
  delete rest.blobs;
  const metaBytes = new TextEncoder().encode(JSON.stringify({ ...rest, blobManifest: manifest }));

  const total = 4 + metaBytes.byteLength + chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, metaBytes.byteLength, true);
  out.set(metaBytes, 4);
  let off = 4 + metaBytes.byteLength;
  for (const chunk of chunks) {
    out.set(chunk, off);
    off += chunk.byteLength;
  }
  return out;
}

/** Inverse of `encodeParsed`. */
function decodeParsed(buf: ArrayBuffer): ParsedBook {
  const bytes = new Uint8Array(buf);
  const metaLen = new DataView(buf).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + metaLen)));
  const { blobManifest, ...rest } = meta as { blobManifest: BlobManifestEntry[] } & Record<string, unknown>;
  const blobs: Record<string, Blob> = {};
  let off = 4 + metaLen;
  for (const { key, type, len } of blobManifest) {
    blobs[key] = new Blob([bytes.subarray(off, off + len)], type ? { type } : undefined);
    off += len;
  }
  return { ...rest, blobs } as unknown as ParsedBook;
}

/** Returns the cached parsed book, or null on miss. `keyB64` decrypts host books;
 *  an encrypted entry with no key available is treated as a miss. */
export async function getCachedBook(id: string, keyB64?: string): Promise<ParsedBook | null> {
  const value = await runTx<Blob | ParsedBook>("readonly", (store) => store.get(id));
  if (!value) return null;
  if (value instanceof Blob) {
    if (!keyB64) return null;
    try {
      return decodeParsed(await aesGcmDecrypt(keyB64, await value.arrayBuffer()));
    } catch {
      return null; // wrong key / corrupt entry → re-parse
    }
  }
  return value as ParsedBook;
}

export async function putCachedBook(id: string, data: ParsedBook, keyB64?: string): Promise<void> {
  if (keyB64) {
    const payload = await aesGcmEncrypt(keyB64, await encodeParsed(data));
    await runTx("readwrite", (store) => store.put(new Blob([payload as BlobPart]), id));
    return;
  }
  await runTx("readwrite", (store) => store.put(data, id));
}

export async function deleteCachedBook(id: string): Promise<void> {
  await runTx("readwrite", (store) => store.delete(id));
}
