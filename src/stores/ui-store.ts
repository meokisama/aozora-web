import { create } from "zustand";

interface UiState {
  /** Mirrors the browser's fullscreen state (see platform/fullscreen). */
  fullscreen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  fullscreen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),
}));
