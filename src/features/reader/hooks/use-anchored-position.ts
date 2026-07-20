import { useLayoutEffect, useState, type RefObject } from "react";

const GAP = 6; // px between anchor and popup
const MARGIN = 8; // min gap from viewport edge

export interface PopupRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Places a floating popup against an anchor DOMRect: below by default, flipping
 * above when there's no room, then clamped to the viewport. Measures after
 * layout, so callers must render it off-screen at natural size first.
 * `contentKey` re-measures on content/size change; `onLayout` reports the final box.
 */
export function useAnchoredPosition(
  ref: RefObject<HTMLElement | null>,
  anchor: DOMRect | null,
  contentKey: unknown,
  onLayout?: (rect: PopupRect) => void,
): { left: number; top: number } | null {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) {
      setPos(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = anchor.bottom + GAP;
    if (top + h > vh - MARGIN && anchor.top - GAP - h >= MARGIN) {
      top = anchor.top - GAP - h; // flip above
    }
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));

    let left = anchor.left;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    setPos({ left, top });
    onLayout?.({ left, top, right: left + w, bottom: top + h });
  }, [ref, contentKey, anchor, onLayout]);

  return pos;
}
