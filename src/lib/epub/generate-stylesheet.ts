import { getManifestItems, type OpfContents } from "./opf";

/**
 * Concatenates every manifest CSS file into one stylesheet. Book styles are kept
 * (JP light novels rely on the 電書協 `.vrtl` writing-mode + gaiji sizing); the
 * reader scopes rather than overrides. Exception: `line-height` is stripped so the
 * reader's setting governs (see stripLineHeight).
 */
export function generateStyleSheet(data: Record<string, string | Blob>, contents: OpfContents): string {
  const cssHrefs = getManifestItems(contents)
    .filter((item) => item["@_media-type"] === "text/css")
    .map((item) => item["@_href"]);

  const unique = [...new Set(cssHrefs)];
  const combined = unique.reduce((acc, href) => acc + (data[href] || ""), "");

  // After concatenation, a @charset/@import not at the top is dropped with a warning;
  // the import targets don't resolve here anyway, so strip both.
  return stripLineHeight(combined.replace(/@charset\s+["'][^"']*["']\s*;/gi, "").replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi, ""));
}

/**
 * Drops `line-height` from book CSS so the reader's inherited setting reaches the
 * text. Otherwise a book pinning line-height on an element (e.g. Calibre exports on
 * the `<body>` class, kept on `.aoz-book-body-wrapper`) beats the inherited value
 * and the control does nothing. Mirrors ttsu.
 *
 * Matched at a `{`/`;`/whitespace boundary then `:value` up to `;`/`}`; the boundary
 * char is kept so neighbouring rules survive.
 */
function stripLineHeight(css: string): string {
  return css.replace(/([{;\s])line-height\s*:[^;{}]*;?/gi, "$1");
}
