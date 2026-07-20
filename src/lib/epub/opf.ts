import { XMLParser } from "fast-xml-parser";

/**
 * Shared helpers for reading an EPUB's OPF. Root is usually `<package>` but some
 * books namespace it as `<opf:package>`; these accessors normalize over both.
 */

// fast-xml-parser yields loose records keyed by attribute (`@_…`) / text (`#text`).
/* eslint-disable @typescript-eslint/no-explicit-any -- fast-xml-parser nodes are dynamically keyed; `any` keeps `node["@_…"]` accessors ergonomic across callers. */
export type XmlNode = Record<string, any>;
export type OpfContents = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */
export type PageSpread = "left" | "right" | "center";
export type ItemLayout = "pre-paginated" | "reflowable";
export type RenditionSpread = "none" | "landscape" | "portrait" | "both";

export const xmlParser = new XMLParser({ ignoreAttributes: false });

export function isOpfPrefixed(contents: OpfContents): boolean {
  return contents["opf:package"] !== undefined;
}

function root(contents: OpfContents): XmlNode {
  return isOpfPrefixed(contents) ? contents["opf:package"] : contents.package;
}

const key = (contents: OpfContents, base: string) => (isOpfPrefixed(contents) ? `opf:${base}` : base);

export function getManifestItems(contents: OpfContents): XmlNode[] {
  const manifest = root(contents)[key(contents, "manifest")];
  return asArray(manifest?.[key(contents, "item")]);
}

export function getSpineItemRefs(contents: OpfContents): XmlNode[] {
  const spine = root(contents)[key(contents, "spine")];
  return asArray(spine?.[key(contents, "itemref")]);
}

export function getMetadata(contents: OpfContents): XmlNode | undefined {
  return root(contents)[key(contents, "metadata")];
}

export function getMetaKey(contents: OpfContents): string {
  return key(contents, "meta");
}

/** Spine `page-progression-direction` ("rtl" for vertical/RTL books, else ""). */
export function getPageProgressionDirection(contents: OpfContents): string {
  const spine = root(contents)[key(contents, "spine")];
  return spine?.["@_page-progression-direction"] || "";
}

/** Value of a `<meta property="…">` rendition property (e.g. "rendition:layout"). */
export function getRenditionProperty(contents: OpfContents, property: string): string {
  const metaKey = getMetaKey(contents);
  for (const m of asArray(getMetadata(contents)?.[metaKey])) {
    if (m && typeof m === "object" && m["@_property"] === property) {
      const text = m["#text"];
      return text == null ? "" : String(text).trim();
    }
  }
  return "";
}

/** Content of a legacy `<meta name="…" content="…">` tag (e.g. "original-resolution"). */
export function getMetaContentByName(contents: OpfContents, name: string): string {
  const metaKey = getMetaKey(contents);
  for (const m of asArray(getMetadata(contents)?.[metaKey])) {
    if (m && typeof m === "object" && m["@_name"] === name) {
      return m["@_content"] ? String(m["@_content"]).trim() : "";
    }
  }
  return "";
}

/**
 * Rendition layout: "pre-paginated" for fixed-layout books (manga/comics), else
 * "reflowable". EPUB3 declares it via `<meta property="rendition:layout">`. OMF
 * books don't — they use `<meta property="omf:version">`; matching bibi, we treat
 * that as pre-paginated.
 */
export function getRenditionLayout(contents: OpfContents): string {
  const declared = getRenditionProperty(contents, "rendition:layout");
  if (declared) return declared;
  if (getRenditionProperty(contents, "omf:version")) return "pre-paginated";
  return "reflowable";
}

export function isFixedLayout(contents: OpfContents): boolean {
  return getRenditionLayout(contents) === "pre-paginated";
}

/**
 * Book-level `rendition:spread` — whether fixed-layout pages may show side by side.
 * `none` never pairs, `both` always, `landscape`/`portrait` only in that window
 * orientation. Matching bibi, absent/`auto` normalises to `landscape` (spec default).
 * Feeds the viewer's "auto" spread mode; an explicit single/double choice overrides.
 */
export function getRenditionSpread(contents: OpfContents): RenditionSpread {
  const value = getRenditionProperty(contents, "rendition:spread").toLowerCase();
  if (value === "none" || value === "portrait" || value === "both") return value;
  return "landscape"; // "", "auto", "landscape", or unrecognised
}

/** Parses a viewport declaration into `{ width, height }`, or null if unreadable. */
function parseViewportString(value: string | null | undefined): { width: number; height: number } | null {
  if (!value) return null;
  const wh = value.match(/width\s*=\s*(\d+(?:\.\d+)?)\s*,\s*height\s*=\s*(\d+(?:\.\d+)?)/i);
  if (wh) return { width: Number(wh[1]), height: Number(wh[2]) };
  const xy = value.match(/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i);
  if (xy) return { width: Number(xy[1]), height: Number(xy[2]) };
  return null;
}

/**
 * Base viewport (pixel size each fixed-layout page is authored against), used to
 * scale pages to fit. Mirrors bibi's resolution order. Null for reflowable books.
 */
export function getBookViewport(contents: OpfContents): { width: number; height: number } | null {
  return (
    parseViewportString(getMetaContentByName(contents, "original-resolution")) ||
    parseViewportString(getRenditionProperty(contents, "rendition:viewport")) ||
    parseViewportString(getRenditionProperty(contents, "fixed-layout-jp:viewport")) ||
    parseViewportString(getRenditionProperty(contents, "omf:viewport")) ||
    null
  );
}

/** Page-spread side from a spine item's `properties`, or null. Accepts bare
 *  (`page-spread-left`) and prefixed (`rendition:page-spread-left`) forms. */
export function parsePageSpread(properties: string | null | undefined): PageSpread | null {
  if (!properties) return null;
  for (const token of String(properties).trim().split(/\s+/)) {
    const m = token.match(/^(?:rendition:)?page-spread-(left|right|center)$/);
    if (m) return m[1] as PageSpread;
  }
  return null;
}

/** Per-itemref `rendition:layout-*` override, or null. Used by mixed books
 *  (reflowable novel with embedded fixed-layout image pages). */
export function parseItemLayout(properties: string | null | undefined): ItemLayout | null {
  if (!properties) return null;
  for (const token of String(properties).trim().split(/\s+/)) {
    const m = token.match(/^rendition:layout-(pre-paginated|reflowable)$/);
    if (m) return m[1] as ItemLayout;
  }
  return null;
}

export interface SpinePageSpread {
  idref: string;
  pageSpread: PageSpread | null;
  layout: ItemLayout | null;
  linear: boolean;
}

/**
 * Reads the spine as page descriptors in reading order. `layout` is the per-itemref
 * override (or null); `linear` is false for `linear="no"` items (out of the flow).
 */
export function getSpinePageSpreads(contents: OpfContents): SpinePageSpread[] {
  return getSpineItemRefs(contents).map((ref) => ({
    idref: ref["@_idref"],
    pageSpread: parsePageSpread(ref["@_properties"]),
    layout: parseItemLayout(ref["@_properties"]),
    linear: ref["@_linear"] !== "no",
  }));
}

export function asArray<T = unknown>(value: T | T[] | null | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** First text of a dc:* field (string, `{#text}`, or array of either). */
export function firstText(value: unknown): string {
  for (const entry of asArray(value)) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (entry && typeof entry === "object") {
      const text = (entry as Record<string, unknown>)["#text"];
      if (text) return String(text).trim();
    }
  }
  return "";
}
