/**
 * Builds the illustration gallery from flattened book HTML.
 *
 * Accumulates the JP char count with the same rules as the reading-position model
 * (gaiji = 1 char). Each non-gaiji image records the running count as `charOffset`
 * so clicking it can `jumpToChar` in either mode. Derived from parsed HTML, not
 * the live (mode-dependent) DOM.
 */

import { countJapanese, isElementGaiji } from "@/lib/epub/dom-utils";

export interface Illustration {
  /** Image path (blob key); stable React key. */
  key: string;
  /** Live object URL for the thumbnail. */
  url: string;
  /** Cumulative JP chars before the image — the reader's nav offset. */
  charOffset: number;
  /** Image alt text, if any. */
  alt: string;
}

/** Extracts the `aoz:<key>` image path from a flattened src/href value. */
function extractKey(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/aoz:([^;]+)/);
  return match ? match[1] : null;
}

export function collectIllustrations(elementHtml: string, keyToUrl: Map<string, string>): Illustration[] {
  const doc = new DOMParser().parseFromString(elementHtml, "text/html");
  const out: Illustration[] = [];
  let chars = 0;

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        chars += countJapanese(child.textContent);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const el = child as Element;
      // Skip ruby readings and hidden subtrees (matches getParagraphNodes).
      if (el.nodeName === "RT") continue;
      if (el.hasAttribute("hidden") || el.hasAttribute("aria-hidden")) continue;

      const tag = el.tagName.toLowerCase();
      if (tag === "img" || tag === "image") {
        if (isElementGaiji(el)) {
          chars += 1; // inline glyph: one char, not a gallery image
          continue;
        }
        const key = extractKey(el.getAttribute("src") || el.getAttribute("href"));
        const url = key ? keyToUrl.get(key) : undefined;
        if (key && url) out.push({ key, url, charOffset: chars, alt: el.getAttribute("alt") || "" });
        continue; // no countable text
      }

      walk(el);
    }
  };

  walk(doc.body);
  return out;
}
