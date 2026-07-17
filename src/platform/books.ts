/**
 * Fetches a book's EPUB bytes into a Blob for `parseBook`. The book is a
 * plaintext `.epub` at a URL, authorised with the host's short-lived token
 * (sent as a header, so it stays out of URLs/logs).
 */

import type { WebBook } from "./types";

export async function readBookBlob(book: WebBook): Promise<Blob> {
  const res = await fetch(book.url, book.token ? { headers: { "X-Reader-Token": book.token } } : undefined);
  if (!res.ok) throw new Error(`Failed to fetch book (${res.status}).`);
  return res.blob();
}
