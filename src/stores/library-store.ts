import { create } from "zustand";
import * as library from "@/platform/library";
import type { Book, ProgressUpdate, UpdateBookPayload } from "@/lib/types";

interface ImportProgress {
  current: number;
  total: number;
}

interface ImportSummary {
  added: number;
  failed: string[];
}

interface LibraryState {
  books: Book[];
  loading: boolean;
  importing: boolean;
  importProgress: ImportProgress | null;
  loadBooks: () => Promise<void>;
  importFiles: (files: File[] | FileList) => Promise<ImportSummary>;
  toggleFavorite: (id: string) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
  updateBook: (id: string, patch: Omit<UpdateBookPayload, "id">) => Promise<Book | null>;
  setFinished: (id: string, finished: boolean) => Promise<void>;
  applyProgress: (id: string, fields: ProgressUpdate) => void;
}

/**
 * Mirrors the IndexedDB library (source of truth: `platform/library`). Replaces
 * the desktop app's `window.electronAPI.library` IPC + SQLite; EPUB metadata is
 * parsed inside `importFile`, and imported epub blobs live in IndexedDB.
 */
export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  loading: true,
  importing: false,
  importProgress: null,

  /** Loads the full library from IndexedDB. */
  loadBooks: async () => {
    set({ loading: true });
    try {
      const books = await library.listBooks();
      set({ books, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  /**
   * Imports the given .epub files (from a file picker or drag-drop), storing each
   * blob + record in IndexedDB, then refreshes the list. Non-.epub files are skipped.
   */
  importFiles: async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".epub"));
    if (!files.length) return { added: 0, failed: [] };
    set({ importing: true, importProgress: { current: 0, total: files.length } });
    const failed: string[] = [];
    let added = 0;
    try {
      let done = 0;
      for (const file of files) {
        set({ importProgress: { current: done + 1, total: files.length } });
        try {
          await library.importFile(file);
          added += 1;
        } catch (err) {
          console.error(`Failed to import ${file.name}`, err);
          failed.push(file.name);
        } finally {
          done += 1;
        }
      }
      const books = await library.listBooks();
      set({ books });
    } finally {
      set({ importing: false, importProgress: null });
    }
    return { added, failed };
  },

  /** Toggles a book's favorite flag optimistically; reverts on failure. */
  toggleFavorite: async (id) => {
    const book = get().books.find((b) => b.id === id);
    if (!book) return;
    const next = !book.favorite;
    set({ books: get().books.map((b) => (b.id === id ? { ...b, favorite: next } : b)) });
    try {
      await library.setFavorite(id, next);
    } catch (err) {
      set({ books: get().books.map((b) => (b.id === id ? { ...b, favorite: !next } : b)) });
      throw err;
    }
  },

  /** Removes a book (record + imported blob + cached content), then refreshes. */
  removeBook: async (id) => {
    await library.removeBook(id);
    set({ books: get().books.filter((b) => b.id !== id) });
  },

  /** Updates editable metadata (title/author/cover); merges the returned record back in. */
  updateBook: async (id, patch) => {
    const updated = await library.updateBook({ id, ...patch });
    if (updated) {
      set({ books: get().books.map((b) => (b.id === id ? { ...b, ...updated } : b)) });
    }
    return updated;
  },

  /**
   * Marks a book finished/unread. Status is derived from `progress`, so this just
   * writes progress (1 = finished, 0 = unread) plus the matching char offset
   * through the normal save-progress path.
   */
  setFinished: async (id, finished) => {
    const book = get().books.find((b) => b.id === id);
    if (!book) return;
    const charCount = book.charCount || 0;
    const fields: ProgressUpdate = finished
      ? { progress: 1, exploredCharCount: charCount, charCount }
      : { progress: 0, exploredCharCount: 0 };
    get().applyProgress(id, fields);
    await library.saveProgress(id, fields).catch(() => {});
  },

  /**
   * Merges progress fields into the in-memory record so the library grid reflects
   * the latest position without a reload; the reader persists the same fields.
   */
  applyProgress: (id, fields) => {
    set({ books: get().books.map((b) => (b.id === id ? { ...b, ...fields } : b)) });
  },
}));
