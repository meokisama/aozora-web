/**
 * Text-under-cursor extraction for the hover dictionary.
 *
 * Resolves the text node under a viewport point and reads the run that *starts*
 * there — forward only, furigana excluded, bounded to the cursor's block. The
 * result can rebuild a live Range over the matched prefix for highlighting.
 *
 * Adapted from Yomitan's `dom-text-scanner.js` / `text-source-generator.js`
 * (GPL-3.0-or-later — see `yomitan/` and NOTICE.md), simplified for our flattened
 * EPUB markup in one shadow root (reuses the search index's furigana-skipping walk).
 */

import { getParagraphNodes } from "@/lib/epub/dom-utils";
import { blockAncestor } from "@/lib/reader/search";

/** Main-process lookup caps the scan at 24 code units; match it here. */
export const MAX_SCAN_LENGTH = 24;

// Invisible chars some EPUBs embed for line-break control. Dropped from the
// scanned text or they'd cause silent lookup misses. Soft hyphen, zero-width
// space/non-joiner, BOM (matching Yomitan's dom-text-scanner).
const ZERO_WIDTH = new Set([0x00ad, 0x200b, 0x200c, 0xfeff]);
const isZeroWidth = (ch: string): boolean => ZERO_WIDTH.has(ch.charCodeAt(0));

/** One contiguous slice of a live text node in the scanned run. */
interface Segment {
  node: Text;
  /** Offset in `node` where this segment begins. */
  start: number;
  /** Code units taken from `node` starting at `start`. */
  length: number;
}

/** The text run under the cursor, mapping a match length back to a Range. */
export interface CursorText {
  /** Scanned text from the cursor, furigana excluded, ≤ maxLength code units. */
  text: string;
  /** Live DOM Range over the first `length` code units of `text`; null if invalid. */
  rangeForLength(length: number): Range | null;
}

/** Builds a Range over the first `length` code units spanned by `segments`. */
function buildRange(segments: Segment[], length: number): Range | null {
  if (!segments.length || length <= 0) return null;
  const range = document.createRange();
  range.setStart(segments[0].node, segments[0].start);
  let remaining = length;
  for (const seg of segments) {
    if (remaining <= seg.length) {
      range.setEnd(seg.node, seg.start + remaining);
      return range;
    }
    remaining -= seg.length;
  }
  // Asked for more than collected: clamp to the last segment's end.
  const last = segments[segments.length - 1];
  range.setEnd(last.node, last.start + last.length);
  return range;
}

/**
 * Reads the run from (`startNode`, `startOffset`) forward through the block's
 * text nodes until `maxLength` code units or the block ends. Zero-width chars are
 * dropped; a gaiji image ends the run (a term can't span an image). Returns null
 * when the start node isn't readable text (furigana/whitespace).
 *
 * Exported for unit testing: needs no layout, unlike `cursorTextFromPoint`.
 */
export function extractRunAt(startNode: Text, startOffset: number, contentRoot: Element, maxLength = MAX_SCAN_LENGTH): CursorText | null {
  const block = blockAncestor(startNode, contentRoot);
  const nodes = getParagraphNodes(block);
  const startIdx = nodes.indexOf(startNode);
  if (startIdx < 0) return null;

  const segments: Segment[] = [];
  let text = "";
  for (let i = startIdx; i < nodes.length && text.length < maxLength; i++) {
    const node = nodes[i];
    if (node.nodeType !== Node.TEXT_NODE) break; // gaiji image — terms can't cross it
    const data = (node as Text).data;
    const from = i === startIdx ? startOffset : 0;
    if (from >= data.length) continue;

    // Walk char by char so zero-width chars drop from the text while their DOM
    // position stays tracked: each kept run is one segment, split at each skipped
    // char, so `buildRange` still maps a match length to a live Range.
    let segStart = -1; // source offset where the current kept run began
    let pos = from;
    for (; pos < data.length && text.length < maxLength; pos++) {
      if (isZeroWidth(data[pos])) {
        if (segStart >= 0) {
          segments.push({ node: node as Text, start: segStart, length: pos - segStart });
          segStart = -1;
        }
        continue;
      }
      if (segStart < 0) segStart = pos;
      text += data[pos];
    }
    if (segStart >= 0) segments.push({ node: node as Text, start: segStart, length: pos - segStart });
  }

  if (!text) return null;
  return { text, rangeForLength: (length) => buildRange(segments, length) };
}

/**
 * Resolves the caret (text node + offset) under a viewport point, piercing the
 * shadow root. Prefers standard `caretPositionFromPoint` (Firefox + Chromium 128+,
 * whose `shadowRoots` option descends into shadow DOM); falls back to WebKit's
 * `caretRangeFromPoint`.
 */
function caretFromPoint(x: number, y: number, shadowRoot: ShadowRoot | null): { node: Node; offset: number } | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = shadowRoot ? document.caretPositionFromPoint(x, y, { shadowRoots: [shadowRoot] }) : document.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
  }
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

/**
 * Extracts the text run under a viewport point for dictionary lookup.
 * `contentRoot` (the reader's content element) bounds the scan to one block and
 * locates the shadow root. Returns null when the point isn't over readable text.
 */
export function cursorTextFromPoint(x: number, y: number, contentRoot: Element, maxLength = MAX_SCAN_LENGTH): CursorText | null {
  const rootNode = contentRoot.getRootNode();
  const shadowRoot = rootNode instanceof ShadowRoot ? rootNode : null;
  const caret = caretFromPoint(x, y, shadowRoot);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
  if (!contentRoot.contains(caret.node)) return null;
  return extractRunAt(caret.node as Text, caret.offset, contentRoot, maxLength);
}

/**
 * Collapsed Range at the caret under a viewport point (piercing the shadow root),
 * for callers needing the DOM position rather than the forward run — e.g. finding
 * the sentence under the cursor. Null when not over readable text in `contentRoot`.
 */
export function caretRangeFromPoint(x: number, y: number, contentRoot: Element): Range | null {
  const rootNode = contentRoot.getRootNode();
  const shadowRoot = rootNode instanceof ShadowRoot ? rootNode : null;
  const caret = caretFromPoint(x, y, shadowRoot);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
  if (!contentRoot.contains(caret.node)) return null;
  const range = document.createRange();
  range.setStart(caret.node, caret.offset);
  range.collapse(true);
  return range;
}
