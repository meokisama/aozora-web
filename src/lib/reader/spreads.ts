/**
 * Groups fixed-layout pages into 1- or 2-page spreads, honouring each page's
 * `page-spread` side and the book's page-progression direction. Ported from
 * bibi's spine-walking logic (bibi.heart.js).
 *
 * Direction decides which side opens a pair: rtl (manga) → `right` opens, next
 * `left` closes; ltr mirrored. Two pages pair only when both are fixed and the
 * first is a lone opener; everything else stays single, keeping its `pageSpread`
 * so the viewer can align it (a lone `left` sits at the left half).
 *
 * When a wholly-fixed book declares no `page-spread` sides (hand-made manga /
 * bare-image OMF), fall back to positional pairing: first page alone, then two-up.
 */

export interface SpreadPage {
  pageSpread: string | null;
  prePaginated?: boolean;
  linear?: boolean;
  idref?: string;
  // Loose index signature so callers can pass their own page shapes without
  // restructuring. `any` (not `unknown`) is required — an `unknown` index makes
  // this a strict supertype those interfaces no longer structurally satisfy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface Spread {
  index: number;
  items: SpreadPage[];
  single: boolean;
  pageSpread: string | null;
}

const isFixed = (p: SpreadPage | null | undefined) => p && p.prePaginated !== false; // default true

/**
 * Positional fallback for fixed books with no page-spread sides. Groups pages
 * two-up; `coverAlone` (default, manga convention) leaves the first page single
 * so pairs land on correct sides. Trailing odd page stays single.
 */
function positionalSpreads(flow: SpreadPage[], coverAlone = true): Spread[] {
  const spreads: Spread[] = [];
  let i = 0;
  if (coverAlone && flow.length) {
    spreads.push({ index: 0, items: [flow[0]], single: true, pageSpread: flow[0].pageSpread || null });
    i = 1;
  }
  for (; i < flow.length; i += 2) {
    const pair = flow.slice(i, i + 2);
    spreads.push({ index: spreads.length, items: pair, single: pair.length === 1, pageSpread: pair[0].pageSpread || null });
  }
  return spreads;
}

export function buildSpreads(pages: SpreadPage[], ppd: "ltr" | "rtl"): Spread[] {
  const before = ppd === "rtl" ? "right" : "left"; // opens a pair
  const after = ppd === "rtl" ? "left" : "right"; // closes it
  const fixed = isFixed;

  const spreads: Spread[] = [];
  const flow = pages.filter((p) => p.linear !== false);

  // No sides declared (and all fixed) → walk-by-side finds no pairs; fall back to
  // positional pairing so double mode still shows spreads.
  if (flow.length > 0 && flow.every((p) => fixed(p) && !p.pageSpread)) {
    return positionalSpreads(flow);
  }

  flow.forEach((page, i) => {
    const last = spreads[spreads.length - 1];
    const prev = i > 0 ? flow[i - 1] : null;

    // Close a pair: this page is the "after" side and prev is a "before" side
    // still alone in the last spread. Both must be fixed — reflowable never pairs.
    if (
      fixed(page) &&
      fixed(prev) &&
      page.pageSpread === after &&
      prev &&
      prev.pageSpread === before &&
      last &&
      last.items.length === 1 &&
      last.items[0] === prev
    ) {
      last.items.push(page);
      last.single = false;
      return;
    }

    spreads.push({
      index: spreads.length,
      items: [page],
      single: true,
      pageSpread: page.pageSpread || null,
    });
  });

  return spreads;
}
