/**
 * User highlights/notes via the CSS Custom Highlight API.
 *
 * Stored as `[startChar, endChar)` char offsets (same model as position/bookmarks/
 * search) so they survive re-flow, font changes and continuous↔paginated switches.
 * Ranges are rebuilt from offsets on every render and registered under one
 * `CSS.highlights` name per colour (`aoz-hl-<key>`). Inverse of `highlight.ts`.
 */

import { getParagraphNodes, getCharacterCount, isNodeGaiji, countJapanese } from "@/lib/epub/dom-utils";
import type { Annotation } from "@/lib/types";

const HL_PREFIX = "aoz-hl-";

/** Palette: `key` stored on the annotation, `swatch` shown in picker, `wash` painted. */
export const ANNOTATION_COLORS = [
  { key: "yellow", label: "Yellow", swatch: "#facc15", wash: "rgba(250, 204, 21, 0.40)" },
  { key: "green", label: "Green", swatch: "#4ade80", wash: "rgba(74, 222, 128, 0.38)" },
  { key: "blue", label: "Blue", swatch: "#60a5fa", wash: "rgba(96, 165, 250, 0.38)" },
  { key: "pink", label: "Pink", swatch: "#f472b6", wash: "rgba(244, 114, 182, 0.38)" },
  { key: "orange", label: "Orange", swatch: "#fb923c", wash: "rgba(251, 146, 60, 0.42)" },
  { key: "purple", label: "Purple", swatch: "#c084fc", wash: "rgba(192, 132, 252, 0.42)" },
  { key: "red", label: "Red", swatch: "#f87171", wash: "rgba(248, 113, 113, 0.40)" },
  { key: "teal", label: "Teal", swatch: "#2dd4bf", wash: "rgba(45, 212, 191, 0.38)" },
] as const;

export type AnnotationColorKey = (typeof ANNOTATION_COLORS)[number]["key"];

export const DEFAULT_ANNOTATION_COLOR: AnnotationColorKey = "yellow";

/** `::highlight()` names + washes, consumed by `reader-styles`. */
export const ANNOTATION_HL_CSS = ANNOTATION_COLORS.map((c) => ({ name: HL_PREFIX + c.key, wash: c.wash }));

/** Swatch colour for a stored key (falls back to default). */
export function colorSwatch(key: string): string {
  return (ANNOTATION_COLORS.find((c) => c.key === key) ?? ANNOTATION_COLORS[0]).swatch;
}

const supported = (): boolean => typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight !== "undefined";

export interface CharSpan {
  startChar: number;
  endChar: number;
  text: string;
}

/**
 * Global char offset of a DOM boundary `(node, offset)` within `root`.
 * Counts chars before the boundary's text node plus the JP-char count before
 * `offset` in it; element/whitespace boundaries snap to the next node's start.
 * `baseChar` = the rendered region's global start (0 continuous, section start paginated).
 */
export function charOffsetAt(root: Element, node: Node, offset: number, baseChar: number): number {
  const nodes = getParagraphNodes(root);
  let cum = 0;
  for (const n of nodes) {
    // Boundary before this node begins → it's in a gap; snap to node start.
    try {
      const at = document.createRange();
      at.setStart(n, 0);
      at.collapse(true);
      if (at.comparePoint(node, offset) <= 0) return baseChar + cum;
    } catch {
      /* comparePoint can throw for detached/foreign nodes */
    }
    if (n === node && n.nodeType === Node.TEXT_NODE) {
      return baseChar + cum + countJapanese((n.textContent || "").slice(0, offset));
    }
    cum += getCharacterCount(n);
  }
  return baseChar + cum; // boundary at/after region end
}

/**
 * Reads a live selection Range into a char span. Null if collapsed or empty
 * (e.g. a pure-punctuation selection, which has no JP-char length).
 */
export function rangeToCharSpan(root: Element, range: Range, baseChar = 0): CharSpan | null {
  if (range.collapsed) return null;
  const startChar = charOffsetAt(root, range.startContainer, range.startOffset, baseChar);
  const endChar = charOffsetAt(root, range.endContainer, range.endOffset, baseChar);
  if (endChar <= startChar) return null;
  return { startChar, endChar, text: range.toString().trim() };
}

/**
 * Raw string index with `need` JP chars before it (surrogate-safe). Punctuation/
 * ASCII carry zero weight; `skipLeading` (highlight start) advances over leading
 * zero-weight chars so the wash begins on a glyph, not a preceding 。or 」.
 */
function rawIndexForJp(text: string, need: number, skipLeading: boolean): number {
  const chars = Array.from(text);
  let count = 0;
  let i = 0;
  let ci = 0;
  while (ci < chars.length && count < need) {
    count += countJapanese(chars[ci]); // 0 or 1
    i += chars[ci].length;
    ci++;
  }
  if (skipLeading) {
    while (ci < chars.length && countJapanese(chars[ci]) === 0) {
      i += chars[ci].length;
      ci++;
    }
  }
  return i;
}

/** Cumulative char count before each node, plus region total. Computed once per
 *  walk so the regex `getCharacterCount` runs once per node, not per boundary. */
function cumulativeCounts(nodes: Node[]): { cum: number[]; total: number } {
  const cum = new Array<number>(nodes.length);
  let acc = 0;
  for (let i = 0; i < nodes.length; i++) {
    cum[i] = acc;
    acc += getCharacterCount(nodes[i]);
  }
  return { cum, total: acc };
}

/** Resolves a global char offset to a DOM boundary in a precomputed node list.
 *  `isStart` skips leading punctuation so the wash begins on a glyph. Clamps to
 *  region start/end. `cum`/`total` from `cumulativeCounts` avoid per-node recount. */
function boundaryForOffset(
  nodes: Node[],
  cum: number[],
  total: number,
  target: number,
  baseChar: number,
  isStart: boolean,
): { node: Node; offset: number } | null {
  const local = target - baseChar;
  let lastText: Text | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const c = cum[i];
    const w = (i + 1 < cum.length ? cum[i + 1] : total) - c;
    if (n.nodeType === Node.TEXT_NODE) {
      if (local <= c + w) {
        return { node: n, offset: rawIndexForJp(n.textContent || "", local - c, isStart) };
      }
      lastText = n as Text;
    } else if (isNodeGaiji(n) && local <= c) {
      // Gaiji image counts as one char; place boundary just before it.
      const parent = n.parentNode;
      if (parent) return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, n) };
    }
  }
  if (lastText) return { node: lastText, offset: (lastText.textContent || "").length };
  return null;
}

/** Builds a Range for `[startChar, endChar)` over precomputed nodes; null if the
 *  span doesn't intersect the region (both ends clamp to the same point). */
function rangeForSpan(nodes: Node[], cum: number[], total: number, startChar: number, endChar: number, baseChar: number): Range | null {
  const s = boundaryForOffset(nodes, cum, total, startChar, baseChar, true);
  const e = boundaryForOffset(nodes, cum, total, endChar, baseChar, false);
  if (!s || !e) return null;
  const range = document.createRange();
  try {
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
  } catch {
    return null;
  }
  return range.collapsed ? null : range;
}

/** Builds a Range for `[startChar, endChar)` within `root`, walking it fresh.
 *  For reuse/testing; `paintAnnotations` walks once and shares the node list. */
export function charSpanToRange(root: Element, startChar: number, endChar: number, baseChar = 0): Range | null {
  const nodes = getParagraphNodes(root);
  const { cum, total } = cumulativeCounts(nodes);
  return rangeForSpan(nodes, cum, total, startChar, endChar, baseChar);
}

/**
 * (Re)paints all annotations onto `root`, one Highlight per colour. Registers
 * colours with visible ranges and clears the rest (so a page swap removes an
 * off-screen wash). Safe to call on every render.
 */
export function paintAnnotations(root: Element | null, annotations: Annotation[], baseChar = 0): void {
  if (!supported()) return;
  const byColor = new Map<string, Range[]>();
  if (root) {
    const nodes = getParagraphNodes(root); // walk once, reuse for every span
    const { cum, total } = cumulativeCounts(nodes); // count each node once
    for (const a of annotations) {
      const range = rangeForSpan(nodes, cum, total, a.startChar, a.endChar, baseChar);
      if (!range) continue;
      const list = byColor.get(a.color);
      if (list) list.push(range);
      else byColor.set(a.color, [range]);
    }
  }
  for (const { key } of ANNOTATION_COLORS) {
    const ranges = byColor.get(key);
    if (ranges && ranges.length) CSS.highlights.set(HL_PREFIX + key, new Highlight(...ranges));
    else CSS.highlights.delete(HL_PREFIX + key);
  }
}

/** Removes every annotation highlight (on book change / unmount). */
export function clearAnnotationHighlights(): void {
  if (!supported()) return;
  for (const { key } of ANNOTATION_COLORS) CSS.highlights.delete(HL_PREFIX + key);
}

/**
 * The annotation covering `offset`, or null. For click-to-edit; on overlap the
 * last-created (topmost) wins. Caller supplies the caret's global offset.
 */
export function annotationAtOffset(annotations: Annotation[], offset: number): Annotation | null {
  let hit: Annotation | null = null;
  for (const a of annotations) {
    if (a.startChar <= offset && offset < a.endChar) hit = a; // later wins → topmost
  }
  return hit;
}
