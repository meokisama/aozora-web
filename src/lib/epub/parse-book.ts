import { extractEpub } from "./extract";
import { generateHtml, PREPEND, type Section } from "./generate-html";
import { generateStyleSheet } from "./generate-stylesheet";
import { firstText, getBookViewport, getMetadata, getPageProgressionDirection, getRenditionLayout, getRenditionSpread, getSpinePageSpreads, isFixedLayout, type PageSpread, type RenditionSpread } from "./opf";
import { buildSpreads } from "@/lib/reader/spreads";

export interface FixedLayoutPage {
  idref: string;
  wrapperId: string;
  pageSpread: PageSpread | null;
  ordinal: number;
}

export interface ParsedBook {
  elementHtml: string;
  styleSheet: string;
  blobs: Record<string, Blob>;
  sections: Section[];
  characters: number;
  vertical: boolean;
  fixedLayout: boolean;
  ppd: string;
  pages: FixedLayoutPage[] | null;
  bookViewport: { width: number; height: number } | null;
  spreadPairs: string[][] | null;
  renditionSpread: RenditionSpread;
  /** `<dc:title>` from the OPF metadata; empty when the EPUB declares none. */
  title: string;
  /** `<dc:creator>` from the OPF metadata; empty when the EPUB declares none. */
  author: string;
}

/**
 * Parses an EPUB blob into the reader payload: flattened HTML, combined stylesheet,
 * image blobs (keyed by path), chapter sections, char count. The expensive step;
 * caller caches results in IndexedDB.
 *
 * Fixed-layout books add fields for rendering wrappers as spreads: page order +
 * `page-spread` sides (`pages`), progression direction (`ppd`), base viewport.
 */
export async function parseBook(blob: Blob): Promise<ParsedBook> {
  const { contents, contentsDirectory, result } = await extractEpub(blob);
  const { element, characters, sections } = generateHtml(result, contents, contentsDirectory);
  const styleSheet = generateStyleSheet(result, contents);

  const blobs: Record<string, Blob> = {};
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof Blob) blobs[key] = value;
  }

  const elementHtml = element.innerHTML;
  const metadata = getMetadata(contents);
  const title = firstText(metadata?.["dc:title"]) || "";
  const author = firstText(metadata?.["dc:creator"]) || "";
  const ppd = getPageProgressionDirection(contents);
  // Vertical (tategaki) detection. PPD=rtl and the 電書協 `vrtl` class are strong
  // signals. Calibre/KFX instead put `writing-mode: vertical-rl` on arbitrary
  // classes (no `vrtl`, sometimes no PPD), so also consult the stylesheet — but only
  // when PPD isn't explicit `ltr`, so a stray vertical caption doesn't flip the book.
  const cssDeclaresVertical = /(?:-webkit-|-epub-)?writing-mode\s*:\s*(?:vertical-[rl]l|tb-[rl]l)/i.test(styleSheet);
  const vertical = ppd === "rtl" || /\bvrtl\b/.test(elementHtml) || (ppd !== "ltr" && cssDeclaresVertical);

  const fixedLayout = isFixedLayout(contents);
  const renditionSpread = getRenditionSpread(contents);
  const effectivePpd = ppd || (fixedLayout ? "rtl" : "ltr");
  const spine = getSpinePageSpreads(contents).filter((p) => p.linear);

  let pages: FixedLayoutPage[] | null = null;
  let bookViewport: { width: number; height: number } | null = null;
  let spreadPairs: string[][] | null = null;
  if (fixedLayout) {
    // Wholly fixed-layout (manga) → FixedLayoutView renders it.
    bookViewport = getBookViewport(contents);
    let ordinal = 0;
    pages = spine.map((p) => ({
      idref: p.idref,
      wrapperId: `${PREPEND}${p.idref}`,
      pageSpread: p.pageSpread,
      ordinal: ordinal++,
    }));
  } else {
    // Reflowable book that may embed fixed-layout image pages (light novel colour
    // spreads). Pre-compute which spine wrappers pair; text pages never pair.
    const packageLayout = getRenditionLayout(contents);
    const flow = spine.map((p) => ({
      idref: p.idref,
      pageSpread: p.pageSpread,
      prePaginated: (p.layout || packageLayout) === "pre-paginated",
    }));
    if (flow.some((p) => p.prePaginated)) {
      spreadPairs = buildSpreads(flow, effectivePpd as "rtl" | "ltr")
        .filter((s) => s.items.length === 2)
        .map((s) => s.items.map((it) => `${PREPEND}${it.idref}`));
      if (!spreadPairs.length) spreadPairs = null;
    }
  }

  return {
    elementHtml,
    styleSheet,
    blobs,
    sections,
    characters,
    vertical,
    fixedLayout,
    ppd: effectivePpd,
    pages,
    bookViewport,
    spreadPairs,
    renditionSpread,
    title,
    author,
  };
}
