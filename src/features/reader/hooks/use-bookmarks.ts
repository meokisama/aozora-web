import { useCallback, useEffect, useState, type RefObject } from "react";
import type { Book, Bookmark as BookmarkRecord } from "@/lib/types";
import type { Section } from "@/lib/epub/generate-html";
import { chapterIndexAt } from "@/lib/reader/chapters";
import * as library from "@/platform/bookmarks";

// Web port: desktop's electronAPI.library IPC swapped for an IndexedDB module
// with the same bookmark methods, so the hook body is unchanged.
const api = () => library;

interface Params {
  book: Book | null;
  chapters: Section[];
  totalRef: RefObject<number>;
  charRef: RefObject<number>;
}

/**
 * Bookmark list for the current book: loading, suggested-name field, add/remove.
 * Position comes from the reader's live refs, so it's independent of the parse/render pipeline.
 */
export function useBookmarks({ book, chapters, totalRef, charRef }: Params) {
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [nameInput, setNameInput] = useState("");

  // Load this book's bookmarks.
  useEffect(() => {
    if (!book) {
      setBookmarks([]);
      return;
    }
    let cancelled = false;
    api()
      .listBookmarks(book.id)
      .then((list) => {
        if (!cancelled) setBookmarks(list || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [book]);

  // Suggested name: TOC chapter title + progress %, or just % if no chapter.
  const computeDefaultName = useCallback(() => {
    const totalChars = totalRef.current || 0;
    const char = charRef.current;
    const pct = totalChars ? Math.round((char / totalChars) * 100) : 0;
    const i = chapterIndexAt(chapters, char);
    const label = i >= 0 ? chapters[i].label || "" : "";
    return label ? `${label}  (${pct}%)` : `${pct}%`;
  }, [chapters, totalRef, charRef]);

  // Adds a bookmark at the current position.
  const addBookmark = useCallback(async () => {
    if (!book) return;
    const charOffset = charRef.current;
    const totalChars = totalRef.current || 0;
    const progress = totalChars ? Math.min(1, Math.max(0, charOffset / totalChars)) : 0;
    const name = nameInput.trim() || computeDefaultName();
    try {
      const bm = await api().addBookmark({ bookId: book.id, charOffset, progress, snippet: name });
      if (bm) {
        setBookmarks((prev) => [...prev, bm].sort((a, b) => a.charOffset - b.charOffset));
        setNameInput(computeDefaultName()); // reset field to fresh default
      }
    } catch (err) {
      console.error("Failed to add bookmark", err);
    }
  }, [book, nameInput, computeDefaultName, totalRef, charRef]);

  const removeBookmark = useCallback(async (id: string) => {
    try {
      await api().removeBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error("Failed to remove bookmark", err);
    }
  }, []);

  return { bookmarks, nameInput, setNameInput, computeDefaultName, addBookmark, removeBookmark };
}
