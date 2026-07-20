import { useMemo, useRef, type RefObject } from "react";
import { IDENTITY, MAX_SCALE, clampPan, clampScale, zoomAtPoint, type ZoomState } from "@/lib/reader/zoom";

/** Scale a double-click zooms to (toggles back to 1 when zoomed). */
const DBLCLICK_SCALE = 2.5;
/** Wheel-zoom sensitivity: e^(-deltaY·k), so zoom is multiplicative. */
const WHEEL_ZOOM_K = 0.002;

export interface FxlZoomHandle {
  /** Point zoom at the spread element (resets to fit); null makes handlers inert. */
  setTarget: (el: HTMLElement | null) => void;
  isZoomed: () => boolean;
  /** Ctrl/⌘+wheel (or pinch) zooms at cursor; plain wheel pans when zoomed. Returns
   *  true if consumed — caller flips pages only on false. */
  handleWheel: (e: WheelEvent) => boolean;
  handleDoubleClick: (e: React.MouseEvent) => void;
  /** Drag-to-pan (no-op unless zoomed); tracks pointer on window. */
  handlePointerDown: (e: React.PointerEvent) => void;
}

/**
 * Zoom & pan for the fixed-layout paginated viewer. State in refs, written
 * straight to the DOM (no re-render) so dragging stays native-speed. Chromium
 * delivers trackpad pinch as Ctrl+wheel. Maths lives in `lib/reader/zoom`.
 * `setTarget` resets zoom — the viewer rebuilds the spread each flip/resize, so a
 * page turn returns to fit.
 */
export function useFxlZoom(stageRef: RefObject<Element | null>): FxlZoomHandle {
  const targetRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef<ZoomState>(IDENTITY);
  const baseRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 }); // unscaled size, for pan bounds

  return useMemo<FxlZoomHandle>(() => {
    // Push the transform onto the target and update the cursor.
    const apply = () => {
      const el = targetRef.current;
      if (!el) return;
      const { scale, tx, ty } = stateRef.current;
      if (scale === 1) {
        el.style.transform = "";
        el.style.cursor = "";
        el.style.willChange = "";
      } else {
        el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        el.style.cursor = "grab";
        el.style.willChange = "transform";
      }
    };

    const set = (next: ZoomState) => {
      stateRef.current = next;
      apply();
    };

    // Cursor position relative to stage centre (the zoom anchor).
    const pointFromCenter = (clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return { px: 0, py: 0, w: baseRef.current.w, h: baseRef.current.h };
      return { px: clientX - (rect.left + rect.width / 2), py: clientY - (rect.top + rect.height / 2), w: baseRef.current.w, h: baseRef.current.h };
    };

    return {
      setTarget: (el) => {
        targetRef.current = el;
        stateRef.current = IDENTITY;
        if (el) {
          baseRef.current = { w: el.offsetWidth, h: el.offsetHeight };
          el.style.transform = "";
          el.style.cursor = "";
          el.style.willChange = "";
        }
      },

      isZoomed: () => stateRef.current.scale > 1,

      handleWheel: (e) => {
        if (!targetRef.current) return false;
        if (e.ctrlKey || e.metaKey) {
          const { px, py, w, h } = pointFromCenter(e.clientX, e.clientY);
          const next = stateRef.current.scale * Math.exp(-e.deltaY * WHEEL_ZOOM_K);
          set(zoomAtPoint(stateRef.current, next, px, py, w, h));
          return true;
        }
        if (stateRef.current.scale > 1) {
          const { w, h } = baseRef.current;
          set(clampPan({ scale: stateRef.current.scale, tx: stateRef.current.tx - e.deltaX, ty: stateRef.current.ty - e.deltaY }, w, h));
          return true;
        }
        return false; // at fit → caller flips pages
      },

      handleDoubleClick: (e) => {
        if (!targetRef.current) return;
        if (stateRef.current.scale > 1) {
          set(IDENTITY);
          return;
        }
        const { px, py, w, h } = pointFromCenter(e.clientX, e.clientY);
        set(zoomAtPoint(stateRef.current, clampScale(DBLCLICK_SCALE, 1, MAX_SCALE), px, py, w, h));
      },

      handlePointerDown: (e) => {
        if (!targetRef.current || stateRef.current.scale <= 1) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const base = { tx: stateRef.current.tx, ty: stateRef.current.ty };
        const el = targetRef.current;
        el.style.cursor = "grabbing";
        const move = (ev: PointerEvent) => {
          const { w, h } = baseRef.current;
          set(clampPan({ scale: stateRef.current.scale, tx: base.tx + (ev.clientX - startX), ty: base.ty + (ev.clientY - startY) }, w, h));
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          if (targetRef.current) targetRef.current.style.cursor = stateRef.current.scale > 1 ? "grab" : "";
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    };
  }, [stageRef]);
}
