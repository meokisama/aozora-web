import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { applyReaderVars, fixedLayoutStyles } from "./reader-styles";
import { buildSpreads, type Spread, type SpreadPage } from "@/lib/reader/spreads";
import { ordinalAtCenter, visibleRange, type StripBox } from "@/lib/reader/strip";
import { useFxlZoom } from "./hooks/use-fxl-zoom";
import { useStripPan } from "./hooks/use-strip-pan";
import type { FixedLayoutPage } from "@/lib/epub/parse-book";
import type { RenditionSpread } from "@/lib/epub/opf";

interface Viewport {
  width: number;
  height: number;
}

/** Imperative handle for the parent reader (via `ref`). */
export interface FixedLayoutHandle {
  jumpToOrdinal: (ordinal: number) => void;
  jumpToId: (wrapperId: string) => boolean;
}

interface FixedLayoutViewProps {
  html: string;
  styleSheet: string;
  pages: FixedLayoutPage[];
  ppd: string;
  bookViewport: Viewport | null;
  renditionSpread: RenditionSpread;
  initialOrdinal: number;
  onChange?: (firstOrdinal: number, totalPages: number) => void;
}

// Aspect ratio (w/h) at/above which "auto" pairs into a two-page spread.
const LANDSCAPE_RATIO = 1.0;
/** Gap between spread halves, CSS px (0 = pages touch). */
const SPREAD_GAP = 0;
/** Fallback when a page has no viewBox and the book no base viewport. */
const FALLBACK_VIEWPORT = { width: 1200, height: 1800 };

function parseViewBox(value: string | null | undefined): Viewport | null {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }
  return null;
}

/** Run a task at browser idle (fallback: short timeout); warms neighbour bitmaps off the render path. */
function whenIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 200);
}

/** Bitmap URL of a page wrapper (raster `<img>` or SVG `<image>`), or null. */
function pageImageUrl(el: Element | undefined): string | null {
  if (!el) return null;
  const img = el.querySelector("img");
  if (img?.getAttribute("src")) return img.getAttribute("src");
  const image = el.querySelector("image");
  return image?.getAttribute("href") || image?.getAttributeNS("http://www.w3.org/1999/xlink", "href") || null;
}

/** Absolutely position a strip box at `start` on the scroll axis, centred on the cross axis. */
function positionStripBox(box: HTMLElement, start: number, horizontal: boolean): void {
  box.style.position = "absolute";
  if (horizontal) {
    box.style.left = `${start}px`;
    box.style.top = "50%";
    box.style.transform = "translateY(-50%)";
  } else {
    box.style.top = `${start}px`;
    box.style.left = "50%";
    box.style.transform = "translateX(-50%)";
  }
}

/** Strip page box plus the build info the virtualizer needs to mount it on demand. */
interface StripItem {
  page: SpreadPage;
  vp: Viewport;
  scale: number;
  start: number;
  size: number;
}

/**
 * Fixed-layout (manga) viewer with its own shadow root. Modes (mangaReadingMode):
 * "paginated" flips one 1–2 page spread at a time; "continuous" lays all pages in a
 * scrollable strip — vertical (fit width) or horizontal filmstrip (fit height).
 * Position is a layout-independent page ordinal, so it survives mode/spread switches.
 */
export const FixedLayoutView = forwardRef<FixedLayoutHandle, FixedLayoutViewProps>(function FixedLayoutView(
  { html, styleSheet, pages, ppd, bookViewport, renditionSpread, initialOrdinal, onChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Element | null>(null);
  const wrappersRef = useRef<Map<string, Element>>(new Map()); // idref/wrapperId → original element
  const viewportsRef = useRef<Map<number, Viewport>>(new Map()); // ordinal → { width, height }
  const viewsRef = useRef<Spread[]>([]); // current view list (spreads or singles)
  const viewIndexRef = useRef(0);
  const ordinalRef = useRef(initialOrdinal || 0);
  const stripLayoutRef = useRef<StripBox[]>([]); // strip: static page positions (scroll↔ordinal)
  const stripItemsRef = useRef<StripItem[]>([]); // strip: per-page build info, indexed like stripLayoutRef
  const stripElRef = useRef<HTMLElement | null>(null); // strip container (parent of mounted boxes)
  const mountedRef = useRef<Map<number, HTMLElement>>(new Map()); // strip: index → mounted box (virtualization window)
  const stripHorizontalRef = useRef(false); // strip: scroll axis is horizontal
  const stripRafRef = useRef(0);
  const stripUpdateRef = useRef<() => void>(() => {}); // latest updateStripWindow(), for the scroll handler
  const prefetchedRef = useRef<Set<string>>(new Set()); // URLs already warmed (paginated neighbor prefetch)
  const renderRef = useRef<() => void>(() => {}); // latest render(), for buildPageBox's onload

  const spreadMode = useSettingsStore((s) => s.mangaSpread);
  const readingMode = useSettingsStore((s) => s.mangaReadingMode);
  const scrollDirection = useSettingsStore((s) => s.mangaScrollDirection);
  const stripWidth = useSettingsStore((s) => s.mangaStripWidth);
  const stripGap = useSettingsStore((s) => s.mangaStripGap);
  const theme = useSettingsStore((s) => s.theme);

  const zoom = useFxlZoom(stageRef);
  const pan = useStripPan(stageRef);

  // Route the press by mode: continuous → grab-to-pan; paginated → drag-to-pan (zoom no-ops unless zoomed).
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (useSettingsStore.getState().mangaReadingMode === "continuous") pan.handlePointerDown(e);
      else zoom.handlePointerDown(e);
    },
    [pan, zoom],
  );

  const doubleSpreads = useMemo(() => buildSpreads(pages, ppd as "ltr" | "rtl"), [pages, ppd]);
  const singleViews = useMemo<Spread[]>(() => pages.map((p) => ({ index: p.ordinal, items: [p], single: true, pageSpread: p.pageSpread })), [pages]);

  const before = ppd === "rtl" ? "right" : "left"; // opener side

  // Authored page size, cached per ordinal. Resolution order (bibi): SVG viewBox →
  // book viewport → bitmap size (width/height attrs, else natural size once loaded).
  const pageViewport = useCallback(
    (page: SpreadPage): Viewport => {
      const cached = viewportsRef.current.get(page.ordinal);
      if (cached) return cached;
      const el = wrappersRef.current.get(page.idref ?? "");
      const vb = parseViewBox(el?.querySelector("svg")?.getAttribute("viewBox"));
      let vp = vb || bookViewport;
      if (!vp) {
        const img = el?.querySelector("img");
        const aw = Number(img?.getAttribute("width"));
        const ah = Number(img?.getAttribute("height"));
        if (aw > 0 && ah > 0) vp = { width: aw, height: ah };
        else if (img && img.naturalWidth > 0) vp = { width: img.naturalWidth, height: img.naturalHeight };
      }
      if (vp) {
        viewportsRef.current.set(page.ordinal, vp);
        return vp;
      }
      // Size still unknown (image not loaded): guess by stage orientation. Not cached —
      // the onload measurement replaces it next layout.
      const stage = stageRef.current;
      const landscape = !!stage && stage.clientWidth > stage.clientHeight;
      return landscape ? { width: FALLBACK_VIEWPORT.height, height: FALLBACK_VIEWPORT.width } : FALLBACK_VIEWPORT;
    },
    [bookViewport],
  );

  const emit = useCallback(() => {
    if (useSettingsStore.getState().mangaReadingMode === "continuous") {
      if (!pages.length) return;
      onChange?.(ordinalRef.current, pages.length);
      return;
    }
    const views = viewsRef.current;
    if (!views.length) return; // not laid out yet — don't report a bogus position
    const view = views[viewIndexRef.current];
    const first = view?.items[0]?.ordinal ?? 0;
    ordinalRef.current = first;
    onChange?.(first, pages.length);
  }, [onChange, pages.length]);

  // One scaled page box (`.aoz-fxl-page` → transformed `.aoz-fxl-canvas` clone),
  // shared by spread and strip paths. `remeasure` re-lays-out once the bitmap's true
  // size loads (spread mode); `lazy` defers off-screen decode (strip mode).
  const buildPageBox = useCallback(
    (page: SpreadPage, vp: Viewport, scale: number, opts: { remeasure?: boolean; lazy?: boolean } = {}): HTMLElement => {
      const { remeasure = true, lazy = false } = opts;
      const box = document.createElement("div");
      box.className = "aoz-fxl-page";
      box.style.width = `${Math.floor(vp.width * scale)}px`;
      box.style.height = `${Math.floor(vp.height * scale)}px`;

      const canvas = document.createElement("div");
      canvas.className = "aoz-fxl-canvas";
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      canvas.style.transform = `scale(${scale})`;

      const original = wrappersRef.current.get(page.idref ?? "");
      if (original) {
        const clone = original.cloneNode(true) as Element;
        if (lazy) {
          for (const img of clone.querySelectorAll("img")) {
            img.loading = "lazy";
            img.decoding = "async";
          }
        }
        canvas.appendChild(clone);
        const ordinal = page.ordinal as number | undefined;
        const img = remeasure && ordinal != null && !viewportsRef.current.has(ordinal) ? clone.querySelector("img") : null;
        if (img) {
          img.addEventListener(
            "load",
            () => {
              if (img.naturalWidth > 0 && ordinal != null && !viewportsRef.current.has(ordinal)) {
                viewportsRef.current.set(ordinal, { width: img.naturalWidth, height: img.naturalHeight });
                renderRef.current();
              }
            },
            { once: true },
          );
        }
      }
      box.appendChild(canvas);
      return box;
    },
    [],
  );

  // Warm bitmaps of the views on either side of `vi` so the next flip paints
  // instantly (paginated). At idle, dedups by URL, no DOM added.
  const prefetchNeighbors = useCallback((views: Spread[], vi: number) => {
    whenIdle(() => {
      for (const view of [views[vi + 1], views[vi - 1]]) {
        if (!view) continue;
        for (const page of view.items) {
          const url = pageImageUrl(wrappersRef.current.get(page.idref ?? ""));
          if (!url || prefetchedRef.current.has(url)) continue;
          prefetchedRef.current.add(url);
          const img = new Image();
          img.decoding = "async";
          img.src = url;
          img.decode?.().catch(() => {});
        }
      }
    });
  }, []);

  // Build the current view's DOM and scale each page to fit the stage.
  const layout = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    if (stageW === 0 || stageH === 0) return;

    // "auto" defers to rendition:spread: `none`→singles, `both`→spreads,
    // `landscape`/`portrait`→pair only in that orientation (absent normalises to
    // `landscape` upstream). Explicit single/double user choice overrides the book.
    const windowLandscape = stageW / stageH >= LANDSCAPE_RATIO;
    const autoDouble =
      renditionSpread === "both" || (renditionSpread === "portrait" ? !windowLandscape : renditionSpread !== "none" && windowLandscape);
    const isDouble = spreadMode === "double" || (spreadMode === "auto" && autoDouble);
    const views = isDouble ? doubleSpreads : singleViews;
    viewsRef.current = views;

    // Re-anchor view index on the tracked ordinal (survives single↔double switch or resize).
    let vi = views.findIndex((v) => v.items.some((p) => p.ordinal === ordinalRef.current));
    if (vi < 0) vi = 0;
    viewIndexRef.current = vi;
    const view = views[vi];

    // Slots: paired spread fills both halves; a lone left/right page blanks the
    // facing half so it sits on its declared side.
    let slots;
    if (view.items.length === 2) {
      slots = [{ page: view.items[0] }, { page: view.items[1] }];
    } else if (isDouble && (view.pageSpread === "left" || view.pageSpread === "right")) {
      slots = view.pageSpread === before ? [{ page: view.items[0] }, { blank: true }] : [{ blank: true }, { page: view.items[0] }];
    } else {
      slots = [{ page: view.items[0] }];
    }

    const halfWidth = (stageW - SPREAD_GAP) / 2;
    const budgetW = slots.length > 1 ? halfWidth : stageW;

    const spread = document.createElement("div");
    spread.className = "aoz-fxl-spread";
    spread.style.flexDirection = ppd === "rtl" ? "row-reverse" : "row";
    spread.style.gap = `${SPREAD_GAP}px`;

    for (const slot of slots) {
      const vp = slot.page ? pageViewport(slot.page) : pageViewport(view.items[0]);
      const scale = Math.min(budgetW / vp.width, stageH / vp.height);

      if (slot.blank) {
        const blank = document.createElement("div");
        blank.className = "aoz-fxl-blank";
        blank.style.width = `${Math.floor(vp.width * scale)}px`;
        blank.style.height = `${Math.floor(vp.height * scale)}px`;
        spread.appendChild(blank);
        continue;
      }

      spread.appendChild(buildPageBox(slot.page!, vp, scale));
    }

    stage.replaceChildren(spread);
    zoom.setTarget(spread); // enable zoom/pan on the new spread (resets to fit)
    prefetchNeighbors(views, vi);
  }, [spreadMode, renditionSpread, doubleSpreads, singleViews, ppd, before, pageViewport, buildPageBox, prefetchNeighbors, zoom]);

  // Scroll the strip so the page sits at its leading edge: top (vertical),
  // left (horizontal-LTR), right (horizontal-RTL).
  const scrollStripToOrdinal = useCallback(
    (ordinal: number) => {
      const stage = stageRef.current;
      const box = stripLayoutRef.current.find((b) => b.ordinal === ordinal);
      if (stage && box) {
        if (!stripHorizontalRef.current) stage.scrollTop = box.start;
        else if (ppd === "rtl") stage.scrollLeft = box.start + box.size - stage.clientWidth;
        else stage.scrollLeft = box.start;
      }
      stripUpdateRef.current(); // mount the visible window even if the box is missing
    },
    [ppd],
  );

  // Strip virtualization: mount only pages within the viewport (± one screen
  // overscan) at their precomputed offsets. Cheap set-diff, run on build and each
  // (rAF-throttled) scroll, bounding live DOM regardless of page count.
  const updateStripWindow = useCallback(() => {
    const stage = stageRef.current;
    const strip = stripElRef.current;
    if (!stage || !strip) return;
    const horizontal = stripHorizontalRef.current;
    const viewStart = horizontal ? stage.scrollLeft : stage.scrollTop;
    const viewSize = horizontal ? stage.clientWidth : stage.clientHeight;
    const overscan = viewSize; // one screen each side
    const range = visibleRange(stripLayoutRef.current, viewStart - overscan, viewStart + viewSize + overscan);

    const mounted = mountedRef.current;
    const want = new Set<number>();
    if (range) for (let i = range[0]; i <= range[1]; i++) want.add(i);

    for (const [idx, el] of mounted) {
      if (!want.has(idx)) {
        el.remove();
        mounted.delete(idx);
      }
    }
    for (const idx of want) {
      if (mounted.has(idx)) continue;
      const item = stripItemsRef.current[idx];
      if (!item) continue;
      const box = buildPageBox(item.page, item.vp, item.scale, { remeasure: false });
      positionStripBox(box, item.start, horizontal);
      strip.appendChild(box);
      mounted.set(idx, box);
    }
  }, [buildPageBox]);
  stripUpdateRef.current = updateStripWindow;

  // Continuous long-strip: precompute every page's scroll-axis position, but mount
  // only visible pages (see updateStripWindow). Vertical column fits width, horizontal
  // filmstrip fits height; horizontal RTL lays pages last→first so page 0 is at the
  // right. Boxes are absolutely positioned, so the container only needs total extent.
  const layoutStrip = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    if (stageW === 0 || stageH === 0) return;

    const horizontal = scrollDirection === "horizontal";
    stripHorizontalRef.current = horizontal;
    stage.classList.toggle("is-strip-h", horizontal);
    stage.classList.toggle("is-strip", !horizontal);

    const strip = document.createElement("div");
    strip.className = horizontal ? "aoz-fxl-strip-h" : "aoz-fxl-strip";

    // Cross axis = stage × size %; scroll-axis extent follows page aspect. RTL
    // horizontal walks pages in reverse so the leading edge is the last page.
    const target = horizontal ? Math.round((stageH * stripWidth) / 100) : Math.round((stageW * stripWidth) / 100);
    const ordered = horizontal && ppd === "rtl" ? [...pages].reverse() : pages;

    const items: StripItem[] = [];
    const boxes: StripBox[] = [];
    let start = stripGap; // leading padding before the first page
    for (const page of ordered) {
      const vp = pageViewport(page);
      const scale = horizontal ? target / vp.height : target / vp.width;
      const size = horizontal ? Math.floor(vp.width * scale) : Math.floor(vp.height * scale);
      items.push({ page, vp, scale, start, size });
      boxes.push({ ordinal: page.ordinal, start, size });
      start += size + stripGap; // trailing gap pads the far end
    }
    // Full scroll-axis extent so scrollbar/positions are correct despite unmounted
    // boxes. Boxes stay sorted by start ascending (visibleRange/ordinalAtCenter need it).
    if (horizontal) strip.style.width = `${start}px`;
    else strip.style.height = `${start}px`;

    stripItemsRef.current = items;
    stripLayoutRef.current = boxes;
    stripElRef.current = strip;
    mountedRef.current = new Map();
    stage.replaceChildren(strip);
    scrollStripToOrdinal(ordinalRef.current); // mounts the initial window too
  }, [pages, ppd, scrollDirection, pageViewport, scrollStripToOrdinal, stripWidth, stripGap]);

  // Pick the render path for the mode; the spread path clears the strip scroller
  // class so its centring/overflow rules apply again.
  const render = useCallback(() => {
    if (readingMode === "continuous") {
      zoom.setTarget(null); // zoom is paginated-only
      layoutStrip();
    } else {
      stageRef.current?.classList.remove("is-strip", "is-strip-h");
      layout();
    }
  }, [readingMode, layout, layoutStrip, zoom]);

  // Latest render() ref so buildPageBox's onload re-lays-out without a circular dep.
  renderRef.current = render;

  // Build the shadow DOM once (and whenever the parsed content changes).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    applyReaderVars(host, useSettingsStore.getState());
    shadow.innerHTML = `<style data-aoz-base>${fixedLayoutStyles()}</style><style>${styleSheet}</style><div class="aoz-fxl-stage"></div>`;
    stageRef.current = shadow.querySelector(".aoz-fxl-stage");

    // Index spine wrappers from the flattened HTML (parsed once, off-screen).
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const map = new Map();
    for (const child of Array.from(tmp.children)) {
      if (child.id) map.set(child.id.replace(/^aoz-/, ""), child);
    }
    wrappersRef.current = map;
    viewportsRef.current = new Map();
    prefetchedRef.current = new Set();

    ordinalRef.current = Math.min(Math.max(0, initialOrdinal || 0), Math.max(0, pages.length - 1));
    render();
    emit();

    // Continuous mode reports the page under the viewport centre as the strip scrolls
    // (rAF-throttled); inert when paginated. On the stage, where the scroller lives.
    const stage = stageRef.current;
    const onScroll = () => {
      if (useSettingsStore.getState().mangaReadingMode !== "continuous") return;
      if (stripRafRef.current) return;
      stripRafRef.current = requestAnimationFrame(() => {
        stripRafRef.current = 0;
        const s = stageRef.current;
        const boxes = stripLayoutRef.current;
        if (!s || !boxes.length) return;
        stripUpdateRef.current(); // keep the mounted window in sync
        const center = stripHorizontalRef.current ? s.scrollLeft + s.clientWidth / 2 : s.scrollTop + s.clientHeight / 2;
        const ordinal = ordinalAtCenter(boxes, center);
        if (ordinal !== ordinalRef.current) {
          ordinalRef.current = ordinal;
          onChange?.(ordinal, pages.length);
        }
      });
    };
    stage?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      stage?.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(stripRafRef.current);
      stripRafRef.current = 0;
      shadow.innerHTML = "";
      stageRef.current = null;
    };
    // initialOrdinal is entry-only; later moves go through the ref API.
  }, [html, styleSheet, pages]);

  // Re-render when reading mode or spread mode toggles.
  useEffect(() => {
    if (!stageRef.current) return;
    render();
    emit();
  }, [spreadMode, readingMode, render, emit]);

  // Repaint page background on theme change (parent's settings effect only touches
  // the reflowable host, which manga doesn't mount).
  useEffect(() => {
    if (hostRef.current) applyReaderVars(hostRef.current, useSettingsStore.getState());
  }, [theme]);

  // Advance/retreat one step: continuous scrolls ~one viewport along the strip axis;
  // paginated swaps spreads. Horizontal RTL advances leftward.
  const flip = useCallback(
    (dir: number) => {
      const stage = stageRef.current;
      if (useSettingsStore.getState().mangaReadingMode === "continuous") {
        if (!stage) return;
        if (stripHorizontalRef.current) {
          const sign = ppd === "rtl" ? -1 : 1;
          stage.scrollBy({ left: dir * sign * (stage.clientWidth * 0.9), behavior: "smooth" });
        } else {
          stage.scrollBy({ top: dir * (stage.clientHeight * 0.9), behavior: "smooth" });
        }
        return;
      }
      const next = viewIndexRef.current + dir;
      if (next < 0 || next >= viewsRef.current.length) return;
      viewIndexRef.current = next;
      ordinalRef.current = viewsRef.current[next].items[0].ordinal;
      layout();
      emit();
    },
    [ppd, layout, emit],
  );

  // Jump to a page: strip scrolls to it, spread re-lays-out around it.
  const goToOrdinal = useCallback(
    (ordinal: number) => {
      ordinalRef.current = Math.min(Math.max(0, ordinal), Math.max(0, pages.length - 1));
      if (useSettingsStore.getState().mangaReadingMode === "continuous") {
        scrollStripToOrdinal(ordinalRef.current);
        emit();
      } else {
        layout();
        emit();
      }
    },
    [layout, emit, scrollStripToOrdinal, pages.length],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpToOrdinal: (ordinal: number) => goToOrdinal(ordinal),
      jumpToId: (wrapperId: string) => {
        const idref = String(wrapperId).replace(/^aoz-/, "");
        const page = pages.find((p) => p.idref === idref);
        if (!page) return false;
        goToOrdinal(page.ordinal);
        return true;
      },
    }),
    [goToOrdinal, pages],
  );

  // Resize: re-render (auto spread may flip single↔double; strip re-fits widths). The
  // initial callback also handles a zero-size stage at mount. rAF-coalesced to rebuild
  // once per frame during a drag.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        render();
        emit();
      });
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [render, emit]);

  // Keyboard nav. Left/right follow reading direction (RTL left advances); drive
  // paginated flips and horizontal strip, inert in the vertical strip. Up/Down/Space
  // always step the active axis.
  useEffect(() => {
    const rtl = ppd === "rtl";
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const continuous = useSettingsStore.getState().mangaReadingMode === "continuous";
      const verticalStrip = continuous && !stripHorizontalRef.current;
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          if (verticalStrip) return;
          flip(rtl ? 1 : -1);
          break;
        case "ArrowRight":
        case "KeyD":
          if (verticalStrip) return;
          flip(rtl ? -1 : 1);
          break;
        case "ArrowDown":
        case "PageDown":
          flip(1);
          break;
        case "ArrowUp":
        case "PageUp":
          flip(-1);
          break;
        case "Space":
          flip(e.shiftKey ? -1 : 1);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ppd, flip]);

  // Wheel (native listener so Ctrl+wheel zoom can preventDefault — else Electron
  // page-zooms). Paginated: zoom/pan takes the wheel first, else it flips (debounced).
  // Continuous: vertical strip scrolls natively; horizontal filmstrip maps deltaY onto
  // its axis (wheel-down advances, leftward in RTL) since most wheels only emit deltaY.
  const wheelTsRef = useRef(0);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      if (useSettingsStore.getState().mangaReadingMode === "continuous") {
        if (!stripHorizontalRef.current) return; // vertical strip scrolls natively
        const delta = e.deltaY || e.deltaX;
        if (!delta) return;
        e.preventDefault();
        const stage = stageRef.current;
        if (stage) stage.scrollLeft += ppd === "rtl" ? -delta : delta;
        return;
      }
      if (zoom.handleWheel(e)) {
        e.preventDefault();
        return;
      }
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      const now = e.timeStamp;
      if (now - wheelTsRef.current < 250) return;
      wheelTsRef.current = now;
      flip(delta > 0 ? 1 : -1);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [ppd, flip, zoom]);

  return (
    <div ref={hostRef} onPointerDown={onPointerDown} onDoubleClick={zoom.handleDoubleClick} className="h-full w-full overflow-hidden" />
  );
});
