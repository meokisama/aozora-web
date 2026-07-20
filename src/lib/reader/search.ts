/**
 * In-book full-text search.
 *
 * No separate text store: the flattened book HTML is the only source. Walked like
 * the reading-position model, grouped into blocks each recording its cumulative
 * char offset (the `exploredCharCount` the reader navigates by), so a hit's
 * `charOffset` feeds `jumpToChar` / `restoreToChar` in either mode.
 *
 * Normalization is length-preserving (every transform is 1:1), so the normalized
 * index doubles as a raw-text index — keeping snippets and highlight ranges
 * aligned. `<rt>` readings are excluded, so queries match base text across furigana.
 */

import { getParagraphNodes, getCharacterCount, isNodeGaiji, countJapanese } from "@/lib/epub/dom-utils";

/** Cap on returned (not counted) matches; true total reported separately. */
export const MAX_RESULTS = 500;

export interface Block {
  el?: Element;
  charBefore: number;
  text: string;
  nodes: { node: Node; isGaiji: boolean }[];
}

export interface SearchIndexEntry {
  charBefore: number;
  text: string;
  normalized: string;
}

export interface SearchResult {
  charOffset: number;
  pre: string;
  hit: string;
  post: string;
}

// Inline tags that don't break a paragraph: text on either side stays in the
// same searchable block (so a query spanning e.g. a ruby base still matches).
const INLINE_TAGS = new Set([
  "RUBY",
  "RT",
  "RP",
  "RB",
  "SPAN",
  "A",
  "EM",
  "STRONG",
  "B",
  "I",
  "U",
  "S",
  "SUP",
  "SUB",
  "SMALL",
  "MARK",
  "CODE",
  "WBR",
  "BR",
  "FONT",
  "Q",
  "CITE",
  "ABBR",
  "BDI",
  "BDO",
  "TIME",
  "VAR",
  "KBD",
  "SAMP",
]);

/** Nearest non-inline ancestor of a node (its "paragraph"), bounded by root. */
export function blockAncestor(node: Node, root: Element): Element {
  let el: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  while (el && el !== root && el.parentElement && INLINE_TAGS.has(el.tagName)) {
    el = el.parentElement;
  }
  return el || root;
}

/**
 * Length-preserving normalization: fold full-width ASCII to half-width, any
 * whitespace (incl. ideographic space) to a single space, then lower-case. Every
 * replacement is 1:1, so length is preserved and indices stay aligned.
 */
export function normalize(str: string | null | undefined): string {
  if (!str) return "";
  let out = "";
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) out += String.fromCodePoint(code - 0xfee0);
    else if (code === 0x3000 || /\s/.test(ch)) out += " ";
    else out += ch;
  }
  return out.toLowerCase();
}

/**
 * Walks content into block-level text units, each carrying its cumulative char
 * offset, raw text, and the live text nodes it spans (for highlight ranges).
 * Image-only (text-free) blocks are dropped.
 */
export function collectBlocks(rootEl: Element): Block[] {
  const nodes = getParagraphNodes(rootEl);
  const blocks: Block[] = [];
  let cumulative = 0;
  let cur: Block | null = null;

  for (const node of nodes) {
    const gaiji = isNodeGaiji(node);
    const blk = blockAncestor(node, rootEl);
    if (!cur || blk !== cur.el) {
      cur = { el: blk, charBefore: cumulative, text: "", nodes: [] };
      blocks.push(cur);
    }
    if (!gaiji) cur.text += node.textContent;
    cur.nodes.push({ node, isGaiji: gaiji });
    cumulative += getCharacterCount(node);
  }

  return blocks.filter((b) => b.text.trim().length > 0);
}

/** Builds the search index; pre-normalizes each block so per-keystroke queries
 *  don't re-scan raw text. */
export function buildSearchIndex(elementHtml: string): SearchIndexEntry[] {
  const div = document.createElement("div");
  div.innerHTML = elementHtml;
  return collectBlocks(div).map((b) => ({
    charBefore: b.charBefore,
    text: b.text,
    normalized: normalize(b.text),
  }));
}

function makeSnippet(text: string, idx: number, len: number, ctx = 24): { pre: string; hit: string; post: string } {
  const start = Math.max(0, idx - ctx);
  const end = Math.min(text.length, idx + len + ctx * 2);
  return {
    pre: (start > 0 ? "…" : "") + text.slice(start, idx),
    hit: text.slice(idx, idx + len),
    post: text.slice(idx + len, end) + (end < text.length ? "…" : ""),
  };
}

/** Finds every occurrence of `query`; each result's `charOffset` feeds jumpToChar. */
export function searchIndex(
  index: SearchIndexEntry[],
  query: string,
  max = MAX_RESULTS,
): { results: SearchResult[]; total: number; capped: boolean } {
  const q = normalize(query ?? "");
  if (!q.trim()) return { results: [], total: 0, capped: false };

  const results: SearchResult[] = [];
  let total = 0;
  for (const blk of index) {
    let from = 0;
    let idx: number;
    // Accumulate JP-char count as matches advance instead of re-counting the
    // prefix each hit (was O(matches × blockLen)); match boundaries fall on
    // codepoint boundaries, so this is exactly additive.
    let prevIdx = 0;
    let jpAcc = 0;
    while ((idx = blk.normalized.indexOf(q, from)) !== -1) {
      total += 1;
      if (results.length < max) {
        jpAcc += countJapanese(blk.text.slice(prevIdx, idx));
        prevIdx = idx;
        results.push({
          charOffset: blk.charBefore + jpAcc,
          ...makeSnippet(blk.text, idx, q.length),
        });
      }
      from = idx + q.length;
    }
  }
  return { results, total, capped: total > results.length };
}
