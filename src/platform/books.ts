/** Fetches a book's EPUB bytes into a Blob, authorised via a header token. */

import { aesGcmDecrypt } from "@/lib/crypto";
import type { WebBook } from "./types";

/** Download progress; `total` is null when `Content-Length` is absent. */
export type DownloadProgress = { loaded: number; total: number | null };

/** Streams the body to report progress; falls back to `arrayBuffer()` if not a stream. */
async function readBytes(res: Response, onProgress?: (p: DownloadProgress) => void): Promise<Uint8Array> {
  const lenHeader = res.headers.get("Content-Length");
  const total = lenHeader ? Number(lenHeader) || null : null;
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress?.({ loaded: buf.byteLength, total: total ?? buf.byteLength });
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ loaded: 0, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readBookBlob(book: WebBook, onProgress?: (p: DownloadProgress) => void): Promise<Blob> {
  const res = await fetch(book.url, book.token ? { headers: { "X-Reader-Token": book.token } } : undefined);
  if (!res.ok) throw new Error(`Failed to fetch book (${res.status}).`);
  const bytes = await readBytes(res, onProgress);
  // Host books arrive AES-256-GCM encrypted (iv||ciphertext||tag); external URLs have no key.
  if (!book.key) return new Blob([bytes as BlobPart]);
  return new Blob([await aesGcmDecrypt(book.key, bytes.buffer as ArrayBuffer)]);
}
