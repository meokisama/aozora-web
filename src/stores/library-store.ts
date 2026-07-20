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

/** Mirrors the IndexedDB library (source of truth: `platform/library`);
 *  replaces the desktop app's electron IPC + SQLite. */
export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  loading: true,
  importing: false,
  importProgress: null,

  /** Loads the library from IndexedDB. */
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

  /** Imports .epub files into IndexedDB, then refreshes. Non-.epub skipped. */
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

  /** Toggles favorite optimistically; reverts on failure. */
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

  /** Removes a book (record + blob + cached content). */
  removeBook: async (id) => {
    await library.removeBook(id);
    set({ books: get().books.filter((b) => b.id !== id) });
  },

  /** Updates editable metadata (title/author/cover). */
  updateBook: async (id, patch) => {
    const updated = await library.updateBook({ id, ...patch });
    if (updated) {
      set({ books: get().books.map((b) => (b.id === id ? { ...b, ...updated } : b)) });
    }
    return updated;
  },

  /** Marks finished/unread. Status derives from `progress`, so just write
   *  progress (1 = finished, 0 = unread) + matching char offset. */
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

  /** Merges progress into the in-memory record so the grid updates without a
   *  reload; the reader persists the same fields. */
  applyProgress: (id, fields) => {
    set({ books: get().books.map((b) => (b.id === id ? { ...b, ...fields } : b)) });
  },
}));
