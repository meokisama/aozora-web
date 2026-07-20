import { THEMES, type FontFamily, type ThemeName } from "@/stores/settings-store";
import { resolveFontStack, type CustomFont } from "@/stores/fonts-store";
import { ANNOTATION_HL_CSS } from "@/lib/reader/annotations";

/** Display rules shared by both reading modes (driven by inherited CSS vars). */
const SHARED_DISPLAY = `
  font-size: var(--reader-font-size, 1.25rem);
  line-height: var(--reader-line-height, 1.8);
  color: var(--reader-color, #1f1d1a);
  background: var(--reader-bg, #faf8f4);
`;

/**
 * Forces the writing direction onto the flattened book wrappers. JP novels carry the
 * 電書協 template's `.vrtl { writing-mode: vertical-rl }`; a two-class selector outranks
 * the bare `.vrtl`, winning even against its `!important`.
 */
function writingModeRules(scope: string, vertical: boolean) {
  const wm = vertical ? "vertical-rl" : "horizontal-tb";
  return `
    ${scope} .aoz-book-html-wrapper,
    ${scope} .aoz-book-body-wrapper {
      writing-mode: ${wm} !important;
      -webkit-writing-mode: ${wm} !important;
    }
  `;
}

/** Continuous (scroll) reader CSS. Display props come from inherited host vars; only writing mode is baked in, so re-injected on toggle. */
export function continuousStyles(vertical: boolean) {
  return `
    :host { display: block; height: 100%; }
    .aozora-content {
      box-sizing: border-box;
      writing-mode: ${vertical ? "vertical-rl" : "horizontal-tb"};
      /* Vertical-rl needs a definite viewport height; horizontal-tb only a floor.
         Horizontal L/R padding is the side margin (% width, --reader-side-padding); equal padding centres it. */
      ${vertical ? "height: 100%; padding: 2.5rem 3rem;" : "min-height: 100%; padding: 2.5rem var(--reader-side-padding, 12%);"}
      ${SHARED_DISPLAY}
    }
    /* Vertical-rl only: definite wrapper height so full-page images size to the viewport instead of collapsing.
       Horizontal-tb wrappers must stay auto-height, else chapters overflow and overlap. */
    ${
      vertical
        ? `.aozora-content > div,
    .aozora-content .aoz-book-html-wrapper,
    .aozora-content .aoz-book-body-wrapper { height: 100%; }`
        : ""
    }
    /* Breathing room around full-page image spreads; block-axis margin, correct for both writing modes. */
    .aozora-content > div:has(.aoz-no-text) { margin-block: 2.5rem; }
    ${writingModeRules(".aozora-content", vertical)}
    ${imageRules(".aozora-content", undefined, undefined, vertical)}
    ${furiganaRules(".aozora-content")}
    ${searchHitRule()}
    ${lookupHitRule()}
    ${karaokeHitRule()}
    ${annotationHitRules()}

    .aozora-content a { color: inherit; }
    /* Force the reader's font over fonts the book hardcodes (電書協 novels set font-family on body/p/spans);
       must win across the whole subtree. gaiji/illustrations are images, unaffected. */
    .aozora-content,
    .aozora-content * {
      font-family: var(--reader-font-family, serif) !important;
    }
  `;
}

/**
 * Paginated (page-flip) reader CSS. `.aozora-content` is a fixed overflow-hidden viewport;
 * `.aoz-page-content` is the multi-column container the controller sizes and scrolls. One spine section at a time.
 */
export function paginatedStyles(vertical: boolean) {
  return `
    :host { display: block; height: 100%; }
    .aozora-content {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      overflow: hidden;
      writing-mode: ${vertical ? "vertical-rl" : "horizontal-tb"};
      ${SHARED_DISPLAY}
    }
    ${writingModeRules(".aozora-content", vertical)}
    ${imageRules(".aozora-content", "6rem", "8rem", vertical)}
    ${spreadRules(".aozora-content")}
    ${furiganaRules(".aozora-content")}
    ${searchHitRule()}
    ${lookupHitRule()}
    ${karaokeHitRule()}
    ${annotationHitRules()}

    .aoz-page-content p { break-inside: avoid; }
    .aozora-content a { color: inherit; }
    .aozora-content,
    .aozora-content * {
      font-family: var(--reader-font-family, serif) !important;
    }
  `;
}

/**
 * Fixed-layout (manga) reader CSS. Stage centres the current spread; each page is sized in JS to the
 * authored viewport × fit scale, laid out at native px and scaled via `transform` (text layers scale
 * with the image). flex-direction (inline per PPD) drives RTL order.
 */
export function fixedLayoutStyles() {
  return `
    :host { display: block; height: 100%; }
    .aoz-fxl-stage {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--reader-bg, #faf8f4);
    }
    /* Zoom layer (useFxlZoom): spread scaled/panned about its centre; touch-action:none routes pinch/drag to our handlers. */
    .aoz-fxl-spread { display: flex; flex-wrap: nowrap; align-items: center; transform-origin: center center; touch-action: none; }
    /* Continuous long-strip: stage becomes a scroller. display:block replaces flex centring so the
       scroller can reach its start edge (a flex-centred overflow container clips its own overflow). */
    /* Strip scrollers grab-to-pan (useStripPan); grab cursor here, swapped to grabbing inline on drag.
       user-select:none stops a drag flickering a text selection. */
    .aoz-fxl-stage.is-strip,
    .aoz-fxl-stage.is-strip-h {
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
    }
    .aoz-fxl-stage.is-strip {
      display: block;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .aoz-fxl-stage.is-strip-h {
      display: block;
      overflow-x: auto;
      overflow-y: hidden;
    }
    /* Virtualized strip: container sized inline to the full scroll extent; only in-view pages mount,
       each absolutely positioned at its precomputed offset and cross-axis centred (see positionStripBox). */
    .aoz-fxl-strip { position: relative; width: 100%; }
    .aoz-fxl-strip-h { position: relative; height: 100%; }
    .aoz-fxl-page { position: relative; overflow: hidden; flex: 0 0 auto; }
    .aoz-fxl-blank { flex: 0 0 auto; }
    .aoz-fxl-canvas { position: absolute; top: 0; left: 0; transform-origin: top left; }
    /* Flattened spine wrappers fill the authored viewport box exactly, so the SVG/image scales with the canvas transform. */
    .aoz-fxl-canvas .aoz-book-html-wrapper,
    .aoz-fxl-canvas .aoz-book-body-wrapper {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
    }
    .aoz-fxl-canvas svg,
    .aoz-fxl-canvas img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      /* Kill native image-drag ghost so grab-pan drags the strip, not the page. */
      -webkit-user-drag: none;
    }
    /* Scroller is in the shadow root, out of reach of index.css's global scrollbar styling — mirror it here. */
    .aoz-fxl-stage::-webkit-scrollbar { width: 3px; height: 3px; }
    .aoz-fxl-stage::-webkit-scrollbar-track { background: transparent; }
    .aoz-fxl-stage::-webkit-scrollbar-thumb { background: #a0a0a0; border-radius: 5px; }
    .aoz-fxl-stage::-webkit-scrollbar-thumb:hover { background: #727272; }
  `;
}

/**
 * Illustration sizing, shared by both modes. Capped against reader pixel size (--reader-w/-h; padV/padH
 * budget the padding) since the book's percentage max-* can't resolve through the auto-height/inline wrappers.
 *
 * Full-page SVGs (percentage w/h + viewBox) collapse to 0 width when both dims are auto (the "blank
 * illustration page" bug); anchoring height to the viewport lets the viewBox derive width in both writing modes.
 */
export function imageRules(scope: string, padV = "5rem", padH = "6rem", vertical = false) {
  const maxW = `calc(var(--reader-w, 100vw) - ${padH})`;
  const maxH = `calc(var(--reader-h, 100vh) - ${padV})`;
  // Centre in-flow illustrations: block lets inline-axis auto margins work (inline can't).
  // Horizontal-tb only (vertical-rl is already fine). Gaiji stay inline.
  const inflowCentering = vertical
    ? ""
    : `
    ${scope} img:not([class*="gaiji"]) { display: block; }
    ${scope} svg:not([class*="gaiji"]) { display: block; margin-inline: auto; }`;
  return `${inflowCentering}
    /* Kill native image-drag: mousedown near an inline image starts a drag-ghost instead of selecting text. */
    ${scope} img,
    ${scope} svg { -webkit-user-drag: none; }

    /* Centre image-only pages on both axes via flex. margin:auto can't (inline SVG; vertical-rl block
       flow starts at the right edge — why these once sat flush right); flex centres regardless of writing mode. */
    ${scope} .aoz-no-text {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ${scope} .aoz-no-text svg {
      width: auto;
      height: ${maxH};
      max-width: ${maxW};
      break-inside: avoid;
    }
    ${scope} svg {
      max-width: ${maxW};
      max-height: ${maxH};
      break-inside: avoid;
    }
    ${scope} img:not([class*="gaiji"]) {
      width: auto;
      height: auto;
      max-width: ${maxW};
      max-height: ${maxH};
      break-inside: avoid;
      margin: auto;
    }
  `;
}

/**
 * Two-page spread layout for mixed books (reflowable novel + embedded fixed-layout image pages).
 * `merge-spreads` groups opener+closer into one `.aoz-spread`; halves lay side by side (RTL for RTL
 * books), each letterboxing its image so portrait pages stay centred.
 */
export function spreadRules(scope: string) {
  // Each half: capped to half reader width, full height. SVG height is definite — the sizeless
  // `div.main` between wrapper and SVG would collapse a `height: 100%` chain (the "blank illustration" bug).
  const maxH = `calc(var(--reader-h, 100vh) - 6rem)`;
  const halfW = `calc((var(--reader-w, 100vw) - 8rem) / 2)`;
  return `
    ${scope} .aoz-spread {
      /* Reset vertical-rl (set on RTL books): else the inline axis is vertical and flex-direction:row stacks pages top-to-bottom. */
      writing-mode: horizontal-tb;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    ${scope} .aoz-spread[data-ppd="rtl"] { flex-direction: row-reverse; }
    ${scope} .aoz-spread[data-ppd="ltr"] { flex-direction: row; }
    ${scope} .aoz-spread > * {
      flex: 0 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      margin: 0;
    }
    ${scope} .aoz-spread .aoz-no-text {
      display: flex;
      align-items: center;
      justify-content: center;
      width: auto;
      height: 100%;
    }
    ${scope} .aoz-spread svg,
    ${scope} .aoz-spread img {
      display: block;
      width: auto;
      height: ${maxH};
      max-width: ${halfW};
      max-height: ${maxH};
      object-fit: contain;
    }
  `;
}

/**
 * Furigana rules, shared by both modes. Inactive until the content root carries a `.aoz-furigana-<mode>`
 * class (any mode but "show"). "hide" drops readings, "partial" dims (hover/click reveals),
 * "toggle"/"full" hide until hover/click (adds `.reveal-rt`). Colours from `applyReaderVars`.
 */
export function furiganaRules(scope: string) {
  return `
    /* Keep readings out of text selection (copy/lookup) in every mode — else selecting a base word drags in its kana. */
    ${scope} rt {
      user-select: none;
      -webkit-user-select: none;
    }

    ${scope}.aoz-furigana-hide rt { display: none; }

    ${scope}.aoz-furigana-partial rt { color: var(--reader-furigana-hint, #b8b2a6); }
    ${scope}.aoz-furigana-partial ruby.reveal-rt rt { color: inherit; }
    @media (hover: hover) {
      ${scope}.aoz-furigana-partial ruby:hover rt { color: inherit; }
    }

    ${scope}.aoz-furigana-full ruby,
    ${scope}.aoz-furigana-toggle ruby {
      cursor: pointer;
      text-shadow: var(--reader-furigana-glow, #faf8f4) 1px 0 10px;
    }
    ${scope}.aoz-furigana-full ruby rt,
    ${scope}.aoz-furigana-toggle ruby rt { visibility: hidden; }
    ${scope}.aoz-furigana-full ruby.reveal-rt,
    ${scope}.aoz-furigana-toggle ruby.reveal-rt { text-shadow: none; }
    ${scope}.aoz-furigana-full ruby.reveal-rt rt,
    ${scope}.aoz-furigana-toggle ruby.reveal-rt rt { visibility: visible; }
    @media (hover: hover) {
      ${scope}.aoz-furigana-full ruby:hover rt,
      ${scope}.aoz-furigana-toggle ruby:hover rt { visibility: visible; }
      ${scope}.aoz-furigana-toggle ruby:not(.reveal-rt):hover rt { visibility: hidden; }
    }
  `;
}

// A highlight Range sweeps across any furigana <rt> between base-text nodes, and the CSS Custom
// Highlight API ignores `user-select: none`. Re-scoping the pseudo to `rt` (higher specificity than
// bare `::highlight()`) clears the wash off the reading so only base text is painted.
const clearRt = (name: string) => `rt::highlight(${name}) { background-color: transparent; }`;

/** Paints the active search hit (a Range via the CSS Custom Highlight API) without touching the book DOM. */
export function searchHitRule() {
  return `::highlight(aoz-search-hit) { background-color: rgba(250, 204, 21, 0.45); color: inherit; } ${clearRt("aoz-search-hit")}`;
}

/** Paints the hover-dictionary match (`aoz-dict-hit`). Cooler wash than the search hit to stay distinguishable. */
export function lookupHitRule() {
  return `::highlight(aoz-dict-hit) { background-color: rgba(56, 189, 248, 0.35); color: inherit; } ${clearRt("aoz-dict-hit")}`;
}

/** Paints the run being read aloud, synced to TTS audio (`aoz-tts-karaoke`). Warm green, distinct from search (yellow)/dict (cyan). */
export function karaokeHitRule() {
  return `::highlight(aoz-tts-karaoke) { background-color: rgba(34, 197, 94, 0.4); color: inherit; } ${clearRt("aoz-tts-karaoke")}`;
}

/** Paints user highlights, one `::highlight(aoz-hl-<key>)` per palette colour. Washes kept off readings via {@link clearRt}. */
export function annotationHitRules() {
  return ANNOTATION_HL_CSS.map(
    ({ name, wash }) => `::highlight(${name}) { background-color: ${wash}; color: inherit; } ${clearRt(name)}`,
  ).join("\n");
}

/** Writes the reader display settings onto the host as inherited CSS vars. */
export function applyReaderVars(
  host: HTMLElement | null,
  {
    fontSize,
    lineHeight,
    fontFamily,
    theme,
    sideMargin,
  }: { fontSize: number; lineHeight: number; fontFamily: FontFamily; theme: ThemeName; sideMargin?: number },
  customFonts: CustomFont[] = [],
) {
  if (!host) return;
  const t = THEMES[theme] || THEMES.sepia;
  host.style.setProperty("--reader-font-size", `${fontSize}px`);
  host.style.setProperty("--reader-line-height", String(lineHeight));
  host.style.setProperty("--reader-side-padding", `${sideMargin ?? 12}%`);
  host.style.setProperty("--reader-font-family", resolveFontStack(fontFamily, customFonts));
  host.style.setProperty("--reader-color", t.color);
  host.style.setProperty("--reader-bg", t.bg);
  // Furigana dim-hint colour + glow behind hidden readings, tuned per theme so kana stay muted-but-legible and the glow blends in.
  host.style.setProperty("--reader-furigana-hint", t.dark ? "#6f6a60" : "#b3ada1");
  host.style.setProperty("--reader-furigana-glow", t.bg);
  // Paint the host so page-flip mode's outer padding (outside the shadow scroller) shares the page colour.
  host.style.backgroundColor = t.bg;
}
