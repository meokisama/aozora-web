/** Fullscreen API wrapper; mirrors state into the ui-store to keep the toolbar in sync. */

import { useUiStore } from "@/stores/ui-store";

export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  } else {
    void document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Wires `fullscreenchange` → ui-store. Call once at app start; returns cleanup. */
export function initFullscreenSync(): () => void {
  const sync = () => useUiStore.getState().setFullscreen(isFullscreen());
  document.addEventListener("fullscreenchange", sync);
  sync();
  return () => document.removeEventListener("fullscreenchange", sync);
}
