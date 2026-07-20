import { useMemo, type RefObject } from "react";

/** Pointer travel (px) before a press becomes a drag — below this stays a click. */
const DRAG_THRESHOLD = 5;

export interface StripPanHandle {
  /** Grab-to-pan on the strip scroller (caller gates to continuous mode). */
  handlePointerDown: (e: React.PointerEvent) => void;
}

/**
 * Grab-hand panning for the continuous fixed-layout strip. Native scroller, so a
 * pan just writes scrollLeft/scrollTop and the viewer's own scroll listener does
 * the rest. Works both axes (non-scrollable one is a no-op) and RTL (scrollLeft is
 * the physical offset). No re-render. Paginated zoom-pan is separate (useFxlZoom).
 */
export function useStripPan(stageRef: RefObject<Element | null>): StripPanHandle {
  return useMemo<StripPanHandle>(
    () => ({
      handlePointerDown: (e) => {
        if (e.button !== 0) return; // left-drag only
        const stage = stageRef.current as HTMLElement | null;
        if (!stage) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const baseLeft = stage.scrollLeft;
        const baseTop = stage.scrollTop;
        let dragging = false;

        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!dragging) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            dragging = true;
            stage.style.cursor = "grabbing";
          }
          // Drag content with the pointer: pull right → scroll toward start.
          stage.scrollLeft = baseLeft - dx;
          stage.scrollTop = baseTop - dy;
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          stage.style.cursor = ""; // fall back to CSS `grab`
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    }),
    [stageRef],
  );
}
