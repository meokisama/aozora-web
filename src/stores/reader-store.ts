import { create } from "zustand";
import type { WebBook } from "@/platform/types";

interface ReaderState {
  currentBook: WebBook | null;
  open: (book: WebBook) => void;
  close: () => void;
}

/** Tracks which book (if any) is currently open in the reader. */
export const useReaderStore = create<ReaderState>((set) => ({
  currentBook: null,
  open: (book) => set({ currentBook: book }),
  close: () => set({ currentBook: null }),
}));
