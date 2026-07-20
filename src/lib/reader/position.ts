/**
 * Reading-position helpers for the continuous reader.
 *
 * Character-based model (`exploredCharCount`): counting JP chars before the
 * reading point lets progress survive re-flow (font/size changes) independent of
 * pixel layout. Anchors map cumulative char offsets to elements; the reading
 * point is the viewport centre, working the same for vertical-rl and horizontal-tb.
 */

import { getParagraphNodes, getCharacterCount } from "@/lib/epub/dom-utils";

export interface Anchor {
  el: Element;
  charBefore: number;
}

/**
 * Anchors (`{ el, charBefore }`) in document order plus the total char count.
 * `charBefore` is the cumulative count before the element, so the array is
 * non-decreasing — both lookups below binary-search it.
 */
export function collectAnchors(contentEl: Element): { anchors: Anchor[]; total: number } {
  const nodes = getParagraphNodes(contentEl);
  const anchors: Anchor[] = [];
  let cumulative = 0;
  let lastEl: Element | null = null;

  for (const node of nodes) {
    const el: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (el && el !== lastEl) {
      anchors.push({ el, charBefore: cumulative });
      lastEl = el;
    }
    cumulative += getCharacterCount(node);
  }

  return { anchors, total: cumulative };
}

function viewportCentre(host: HTMLElement): { hr: DOMRect; x: number; y: number } {
  const hr = host.getBoundingClientRect();
  return {
    hr,
    x: hr.left + host.clientWidth / 2,
    y: hr.top + host.clientHeight / 2,
  };
}

/**
 * Char offset at the viewport centre (the current `exploredCharCount`).
 * Binary-searches anchors on the reading-direction axis (right→left x for
 * vertical, top→bottom y for horizontal).
 */
export function currentCharAtCenter(host: HTMLElement, anchors: Anchor[], vertical: boolean): number {
  if (!anchors.length) return 0;
  const { x, y } = viewportCentre(host);
  const target = vertical ? -x : y;

  let lo = 0;
  let hi = anchors.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = anchors[mid].el.getBoundingClientRect();
    // Reading-order coordinate, non-decreasing across anchors.
    const primary = vertical ? -r.right : r.top;
    if (primary <= target) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return anchors[best].charBefore;
}

function alignToCenter(host: HTMLElement, el: Element, vertical: boolean): void {
  const { x, y } = viewportCentre(host);
  const r = el.getBoundingClientRect();
  if (vertical) {
    host.scrollLeft += r.left + r.width / 2 - x;
  } else {
    host.scrollTop += r.top + r.height / 2 - y;
  }
}

/** Scrolls the anchor containing `targetChar` to the viewport centre (mirrors
 *  {@link currentCharAtCenter} so save→restore round-trips). */
export function scrollToChar(host: HTMLElement, anchors: Anchor[], vertical: boolean, targetChar: number): void {
  if (!anchors.length) return;
  let lo = 0;
  let hi = anchors.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].charBefore <= targetChar) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  alignToCenter(host, anchors[best].el, vertical);
}

/**
 * Scrolls a TOC target into view, aligning its leading edge to the viewport's
 * (right edge for vertical-rl, top for horizontal-tb). Returns whether found.
 */
export function scrollToElementId(host: HTMLElement, root: Document | ShadowRoot, id: string, vertical: boolean): boolean {
  const el = root.getElementById ? root.getElementById(id) : null;
  if (!el) return false;
  const hr = host.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (vertical) {
    host.scrollLeft += r.right - hr.right;
  } else {
    host.scrollTop += r.top - hr.top;
  }
  return true;
}
