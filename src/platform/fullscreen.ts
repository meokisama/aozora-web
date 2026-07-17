/**
 * Browser Fullscreen API wrapper replacing the desktop app's window IPC. Toggles
 * fullscreen on the document element and mirrors the state into the ui-store so
 * the reader's toolbar and the title-bar visibility stay in sync.
 */

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

/** Wires `fullscreenchange` → ui-store. Call once at app start; returns a cleanup. */
export function initFullscreenSync(): () => void {
  const sync = () => useUiStore.getState().setFullscreen(isFullscreen());
  document.addEventListener("fullscreenchange", sync);
  sync();
  return () => document.removeEventListener("fullscreenchange", sync);
}
