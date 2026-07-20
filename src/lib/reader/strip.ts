/**
 * Helpers for the fixed-layout (manga) continuous "long-strip" reader: pages are
 * stacked in one line and sized up front from their known viewports, forming a
 * static layout the viewer maps scroll offset onto. Coordinates are along the
 * active scroll axis (top vertical, left horizontal), so one set of math serves both.
 */

/** A page's box in content-relative coords along the scroll axis:
 *  `start` = leading edge, `size` = extent. */
export interface StripBox {
  ordinal: number;
  start: number;
  size: number;
}

/**
 * Ordinal of the page at `center` (scroll position + half viewport). Boxes are
 * contiguous, so it's the last box starting at or before the centre (a gap
 * landing resolves to the page just before, which is fine). Boxes sorted by `start`.
 */
export function ordinalAtCenter(boxes: StripBox[], center: number): number {
  if (!boxes.length) return 0;
  let ordinal = boxes[0].ordinal;
  for (const b of boxes) {
    if (center >= b.start) ordinal = b.ordinal;
    else break;
  }
  return ordinal;
}

/**
 * Inclusive index span `[first, last]` of boxes intersecting `[start, end]`, or
 * null if none. Drives strip virtualization: only pages in a padded window stay
 * in the DOM. Boxes sorted by `start`; linear scan is fine for a few hundred pages.
 */
export function visibleRange(boxes: StripBox[], start: number, end: number): [number, number] | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.start + b.size >= start && b.start <= end) {
      if (first === -1) first = i;
      last = i;
    }
  }
  return first === -1 ? null : [first, last];
}
