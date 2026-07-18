/**
 * Library store — the IndexedDB replacement for the desktop app's SQLite `books`
 * table + `library:*` IPC and its filesystem-managed epub files. Two book sources
 * coexist (see `BookSource`):
 *
 * - **host**: opened via `?book=` from the ranobe-hub host. Only the metadata +
 *   progress record is kept here; the epub bytes are still fetched over HTTP
 *   (platform/books). `upsertHostBook` auto-adds it to the library on open.
 * - **local**: imported from the user's machine via `<input type=file>`. The epub
 *   blob is stored in `bookblobs`; the reader reads it back with `getLocalBlob`.
 *
 * Reading progress lives on the book record (as it did in the desktop `books`
 * table), so the library grid and the reader share one source of truth.
 */

import { extractEpubMetadata } from "@/lib/epub/metadata";
import { resizeCoverToDataUrl } from "@/lib/epub/resize-cover";
import { deleteCachedBook } from "@/lib/reader-cache";
import { idbGetAll, idbGetRecord, idbPutRecord, idbDelete, idbGet, idbPut, STORE_BOOKS, STORE_BOOKBLOBS } from "./db";
import type { Book, BookSource, ProgressUpdate, UpdateBookPayload } from "@/lib/types";

/** The host book id for a `?book=` name — the same key progress used pre-library. */
export const hostBookId = (book: string): string => `embed:${book}`;

/** Extracts a book's cover from its epub blob, downscaled to a crisp thumbnail
 *  (see resize-cover). Null when the epub has no cover. Used to populate host
 *  book covers after the reader has the bytes. */
export async function extractCover(blob: Blob): Promise<string | null> {
  const meta = await extractEpubMetadata(blob);
  return resizeCoverToDataUrl(meta.coverBytes, meta.coverMime);
}

export async function listBooks(): Promise<Book[]> {
  return idbGetAll<Book>(STORE_BOOKS);
}

export async function getBook(id: string): Promise<Book | undefined> {
  return idbGetRecord<Book>(STORE_BOOKS, id);
}

/**
 * Ensures a host book (opened via `?book=`) has a library record, creating it if
 * new and refreshing its title/cover once the EPUB is parsed. Never clobbers the
 * stored reading progress. Returns the up-to-date record.
 */
export async function upsertHostBook(fields: {
  name: string;
  title?: string | null;
  author?: string | null;
  language?: string | null;
  coverDataUrl?: string | null;
  fileSize?: number | null;
}): Promise<Book> {
  const id = hostBookId(fields.name);
  const existing = await getBook(id);
  if (existing) {
    // Keep progress/favorite/addedAt; refresh the display metadata if supplied.
    const next: Book = {
      ...existing,
      title: fields.title || existing.title,
      author: fields.author ?? existing.author,
      language: fields.language ?? existing.language,
      coverDataUrl: fields.coverDataUrl ?? existing.coverDataUrl ?? null,
      fileSize: fields.fileSize ?? existing.fileSize,
      lastOpenedAt: Date.now(),
      source: "host",
    };
    await idbPutRecord(STORE_BOOKS, next);
    return next;
  }
  // First time this host book is opened: seed progress from the legacy `progress`
  // store (pre-library readers saved there under the same id) for continuity.
  const legacy = await idbGet<{ progress?: number; exploredCharCount?: number; charCount?: number }>("progress", id).catch(() => undefined);
  const rec: Book = {
    id,
    title: fields.title || fields.name.replace(/^.*\//, "").replace(/\.epub$/i, ""),
    author: fields.author ?? null,
    language: fields.language ?? null,
    filePath: fields.name,
    coverPath: null,
    fileSize: fields.fileSize ?? null,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
    progress: legacy?.progress ?? 0,
    exploredCharCount: legacy?.exploredCharCount ?? 0,
    charCount: legacy?.charCount ?? 0,
    favorite: false,
    coverDataUrl: fields.coverDataUrl ?? null,
    source: "host",
  };
  await idbPutRecord(STORE_BOOKS, rec);
  return rec;
}

/**
 * Imports a local epub: parses its metadata, stores the blob in `bookblobs`, and
 * writes the library record. Returns the new book. Mirrors the desktop import,
 * with the picked `File` replacing the native-dialog source path.
 */
export async function importFile(file: File): Promise<Book> {
  const meta = await extractEpubMetadata(file);
  const id = crypto.randomUUID();
  await idbPut(STORE_BOOKBLOBS, id, file);
  const rec: Book = {
    id,
    title: meta.title || file.name.replace(/\.epub$/i, ""),
    author: meta.author ?? null,
    language: meta.language ?? null,
    filePath: "",
    coverPath: null,
    fileSize: file.size,
    addedAt: Date.now(),
    lastOpenedAt: null,
    progress: 0,
    exploredCharCount: 0,
    charCount: 0,
    favorite: false,
    coverDataUrl: await resizeCoverToDataUrl(meta.coverBytes, meta.coverMime),
    source: "local",
  };
  await idbPutRecord(STORE_BOOKS, rec);
  return rec;
}

/** The stored epub blob for a local book (undefined for host books). */
export async function getLocalBlob(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>(STORE_BOOKBLOBS, id);
}

export async function updateBook({ id, title, author, coverDataUrl: cover }: UpdateBookPayload): Promise<Book | null> {
  const rec = await getBook(id);
  if (!rec) return null;
  if (title !== undefined) rec.title = title.trim() || rec.title;
  if (author !== undefined) rec.author = author.trim() || null;
  if (cover !== undefined) rec.coverDataUrl = cover;
  await idbPutRecord(STORE_BOOKS, rec);
  return rec;
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const rec = await getBook(id);
  if (!rec) return;
  rec.favorite = favorite;
  await idbPutRecord(STORE_BOOKS, rec);
}

/** Merges partial progress fields into the book record. */
export async function saveProgress(id: string, fields: ProgressUpdate): Promise<Book | null> {
  const rec = await getBook(id);
  if (!rec) return null;
  Object.assign(rec, fields);
  await idbPutRecord(STORE_BOOKS, rec);
  return rec;
}

/** Removes a book, its imported blob (if any), and its cached parsed content. */
export async function removeBook(id: string): Promise<void> {
  await idbDelete(STORE_BOOKS, id);
  await idbDelete(STORE_BOOKBLOBS, id).catch(() => {});
  await deleteCachedBook(id).catch(() => {});
}

export type { BookSource };
