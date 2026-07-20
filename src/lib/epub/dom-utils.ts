/** DOM helpers for character counting and image-reference cleanup. */

export function isElementGaiji(el: Element): boolean {
  return Array.from(el.classList).some((c) => c.includes("gaiji"));
}

export function isNodeGaiji(node: Node): node is HTMLImageElement {
  return node instanceof HTMLImageElement && isElementGaiji(node);
}

// Inline wrappers a glyph image may sit inside while staying inline with text.
const INLINE_WRAPPERS = new Set(["SPAN", "A", "B", "I", "EM", "STRONG", "SUP", "SUB", "SMALL", "U", "RB", "RUBY"]);

function hasTextSibling(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  return Array.from(parent.childNodes).some((n) => n !== el && n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
}

/** True if a gaiji image is inline among text (ruby base or has a text sibling,
 *  climbing through inline wrappers). A block's lone image is an illustration. */
function isInlineGlyphImage(img: Element): boolean {
  let el: Element = img;
  while (el.parentElement) {
    const parent = el.parentElement;
    if (parent.tagName === "RUBY" || parent.tagName === "RB") return true;
    if (hasTextSibling(el)) return true;
    if (!INLINE_WRAPPERS.has(parent.tagName)) break; // hit a block — stop
    el = parent;
  }
  return false;
}

/**
 * Tags context-detected gaiji with `aoz-gaiji`. Calibre/KFX give gaiji arbitrary
 * class names, so `isElementGaiji` misses them and the illustration cap blows them
 * up + pollutes the gallery. The marker fixes every consumer at once (reader skip
 * rule, gallery exclusion, one-char count). Mirrors bibi.
 */
export function tagGaijiImages(root: Element): void {
  for (const img of Array.from(root.querySelectorAll("img,image"))) {
    if (isElementGaiji(img)) continue;
    if (isInlineGlyphImage(img)) img.classList.add("aoz-gaiji");
  }
}

// Matches non-Japanese codepoints (kept: kana, kanji, fullwidth alnum, iteration marks).
const isNotJapaneseRegex = /[^0-9A-Z○◯々-〇〻ぁ-ゖゝ-ゞァ-ヺー０-９Ａ-Ｚｦ-ﾝ\p{Radical}\p{Unified_Ideograph}]+/gimu;

/** Counts Japanese codepoints (matches the reader's position model). */
export function countJapanese(str: string | null | undefined): number {
  if (!str) return 0;
  return Array.from(str.replace(isNotJapaneseRegex, "")).length;
}

export function getCharacterCount(node: Node): number {
  if (isNodeGaiji(node)) return 1;
  return countJapanese(node.textContent);
}

/** Collects text nodes and gaiji images, skipping ruby readings + hidden nodes. */
export function getParagraphNodes(node: Node): Node[] {
  const keep = (n: Node): boolean => {
    if (n.nodeName === "RT") return false;
    if (n instanceof HTMLElement && (n.attributes.getNamedItem("aria-hidden") || n.attributes.getNamedItem("hidden"))) {
      return false;
    }
    return true;
  };

  const collect = (n: Node): Node[] => {
    if (!n.hasChildNodes() || !keep(n)) return [];
    return Array.from(n.childNodes)
      .flatMap((child) => {
        if (child.nodeType === Node.TEXT_NODE) return [child];
        if (isNodeGaiji(child)) return [child];
        return collect(child);
      })
      .filter(keep);
  };

  return collect(node).filter((n) => isNodeGaiji(n) || n.textContent?.replace(/\s/g, "").length);
}

export function countCharacters(containerEl: Node): number {
  return getParagraphNodes(containerEl).reduce((sum, node) => sum + getCharacterCount(node), 0);
}

/** Strips image refs not packed into the book so they don't render broken. */
export function clearAllBadImageRef(el: Element): void {
  const clear = (tag: Element, attr: string) => {
    const value = tag.getAttribute(attr);
    if (value && !(value.startsWith("aoz:") || value.startsWith("data:image/gif;aoz:"))) {
      tag.setAttribute(`data-aoz-${attr}`, value);
      tag.removeAttribute(attr);
    }
  };
  Array.from(el.getElementsByTagName("image")).forEach((t) => clear(t, "href"));
  Array.from(el.getElementsByTagName("img")).forEach((t) => clear(t, "src"));
}

/** Normalizes xlink:href (etc.) on SVG <image> elements to plain href. */
export function fixXHtmlHref(el: Element): void {
  Array.from(el.getElementsByTagName("image"))
    .filter((tag) => !tag.getAttributeNames().some((x) => x === "href"))
    .forEach((tag) => {
      const attr = Array.from(tag.attributes).find((a) => a.name.endsWith("href"));
      if (attr) tag.setAttribute("href", attr.value);
    });
}
