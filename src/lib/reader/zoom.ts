/**
 * Pure zoom/pan math for the fixed-layout (manga) viewer (DOM side in
 * `use-fxl-zoom`); split out so it's unit-testable. Coords are relative to the
 * content centre (transform-origin centre), translate applied before scale:
 * `translate(tx, ty) scale(scale)`.
 */

export interface ZoomState {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY: ZoomState = { scale: 1, tx: 0, ty: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;

const clamp = (v: number, lo: number, hi: number) => {
  const r = Math.min(hi, Math.max(lo, v));
  return r === 0 ? 0 : r; // normalise -0 → 0 (avoids "-0px" transforms)
};

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  return clamp(scale, min, max);
}

/**
 * Clamps pan so scaled content can't be dragged past its edges: with a centred
 * origin, content overflows the `w×h` box by `(scale-1)` per axis, half each
 * direction. At scale 1 the only valid offset is 0.
 */
export function clampPan(state: ZoomState, w: number, h: number): ZoomState {
  const maxX = Math.max(0, ((state.scale - 1) * w) / 2);
  const maxY = Math.max(0, ((state.scale - 1) * h) / 2);
  return { scale: state.scale, tx: clamp(state.tx, -maxX, maxX), ty: clamp(state.ty, -maxY, maxY) };
}

/**
 * Zooms to `nextScale` keeping point `(px, py)` (from content centre) pinned under
 * the cursor. From `px = t + s·c` solved so the same `c` maps to the same `px`
 * after scaling. Scale-clamped, then pan-clamped to `w×h`.
 */
export function zoomAtPoint(state: ZoomState, nextScale: number, px: number, py: number, w: number, h: number): ZoomState {
  const scale = clampScale(nextScale);
  const k = scale / state.scale;
  const tx = px * (1 - k) + state.tx * k;
  const ty = py * (1 - k) + state.ty * k;
  return clampPan({ scale, tx, ty }, w, h);
}
