/** Bookmarks store (IndexedDB), replacing the desktop app's SQLite `bookmarks` table. */

import type { Bookmark, AddBookmarkPayload } from "@/lib/types";
import { idbGetAllByIndex, idbPutRecord, idbDelete, STORE_BOOKMARKS } from "./db";

/** A book's bookmarks, ordered by reading position then creation. */
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
