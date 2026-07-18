/**
 * Bookmarks store — the IndexedDB replacement for the desktop app's SQLite
 * `bookmarks` table + `library:*-bookmark` IPC. Exposes the same method names the
 * reader's `use-bookmarks` hook calls (`listBookmarks` / `addBookmark` /
 * `removeBookmark`); id + createdAt are generated here as the main process did.
 */

import type { Bookmark, AddBookmarkPayload } from "@/lib/types";
import { idbGetAllByIndex, idbPutRecord, idbDelete, STORE_BOOKMARKS } from "./db";

/** A book's bookmarks, ordered by reading position (then creation), matching the
 *  original `ORDER BY char_offset ASC, created_at ASC`. */
export async function listBookmarks(bookId: string): Promise<Bookmark[]> {
  const rows = await idbGetAllByIndex<Bookmark>(STORE_BOOKMARKS, "bookId", bookId);
  return rows.sort((a, b) => a.charOffset - b.charOffset || a.createdAt - b.createdAt);
}

export async function addBookmark({ bookId, charOffset, progress, snippet }: AddBookmarkPayload): Promise<Bookmark> {
  const rec: Bookmark = {
    id: crypto.randomUUID(),
    bookId,
    charOffset,
    progress,
    snippet: snippet ?? null,
    createdAt: Date.now(),
  };
  await idbPutRecord(STORE_BOOKMARKS, rec);
  return rec;
}

export async function removeBookmark(id: string): Promise<void> {
  await idbDelete(STORE_BOOKMARKS, id);
}
