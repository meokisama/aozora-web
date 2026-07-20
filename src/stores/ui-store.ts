import { create } from "zustand";

export type AppView = "library" | "stats" | "dictionary" | "about" | "settings";
export type StatusFilter = "all" | "favorites" | "reading" | "finished" | "unread";

interface UiState {
  /** The non-reader page shown when no book is open. */
  view: AppView;
  setView: (view: AppView) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (statusFilter: StatusFilter) => void;
  authorFilter: string | null;
  setAuthorFilter: (authorFilter: string | null) => void;
  /** Mirrors the browser's fullscreen state (see platform/fullscreen). */
  fullscreen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
}

/** Top-level navigation + library filter state (reader is driven separately by
 *  reader-store). Filters survive navigating away and back. */
export const useUiStore = create<UiState>((set) => ({
  view: "library",
  setView: (view) => set({ view }),

  statusFilter: "all",
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  authorFilter: null,
  setAuthorFilter: (authorFilter) => set({ authorFilter }),

  fullscreen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),
}));
