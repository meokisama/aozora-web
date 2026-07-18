import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Highlighter, Images, List, Loader2, Maximize, Minimize, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/stores/reader-store";
import { saveProgress } from "@/platform/progress";
import { useSettingsStore, type WritingMode } from "@/stores/settings-store";
import { useFontsStore } from "@/stores/fonts-store";
import { useUiStore } from "@/stores/ui-store";
import { ReaderSettingsPanel } from "./settings-panel";
import { ReaderToc } from "./reader-toc";
import { ReaderSearch } from "./reader-search";
import { ReaderGallery } from "./reader-gallery";
import { collectIllustrations, type Illustration } from "@/lib/reader/illustrations";
import { applyReaderVars, continuousStyles, paginatedStyles } from "./reader-styles";
import { parseBook, type ParsedBook, type FixedLayoutPage } from "@/lib/epub/parse-book";
import type { RenditionSpread } from "@/lib/epub/opf";
import type { Section } from "@/lib/epub/generate-html";
import { buildReaderHtml } from "@/lib/epub/format-html";
import { getCachedBook, putCachedBook } from "@/lib/reader-cache";
import { collectAnchors, currentCharAtCenter, scrollToChar, scrollToElementId, type Anchor } from "@/lib/reader/position";
import { PaginatedController, type PaginatedState } from "@/lib/reader/paginated";
import { mergeSpreadSections } from "@/lib/reader/merge-spreads";
import { FixedLayoutView, type FixedLayoutHandle } from "./fixed-layout-view";
import { clearSearchHighlight } from "@/lib/reader/highlight";
import { chapterIndexAt } from "@/lib/reader/chapters";
import { FootnotePopup } from "./footnote-popup";
import { collectFootnotes } from "@/lib/reader/footnotes";
import { useReaderSearch } from "./hooks/use-reader-search";
import { ReaderBookmarks } from "./reader-bookmarks";
import { ReaderAnnotations } from "./reader-annotations";
import { AnnotationPopover } from "./annotation-popover";
import { AnnotationTrigger } from "./annotation-trigger";
import { useBookmarks } from "./hooks/use-bookmarks";
import { useAnnotations } from "./hooks/use-annotations";
import { clearAnnotationHighlights, DEFAULT_ANNOTATION_COLOR } from "@/lib/reader/annotations";
import { readBookBlob, type DownloadProgress } from "@/platform/books";
import { toggleFullscreen } from "@/platform/fullscreen";

const FURIGANA_CLASSES = ["aoz-furigana-hide", "aoz-furigana-partial", "aoz-furigana-toggle", "aoz-furigana-full"];

/** Effective writing direction: the user's override, or the book's own when "auto". */
function resolveVertical(mode: WritingMode, bookVertical: boolean): boolean {
  return mode === "auto" ? bookVertical : mode === "vertical";
}

/** Reflects the furigana mode as a class on the content root; "show" clears it
 *  so the book's own furigana styling applies untouched. */
function applyFuriganaClass(root: Element | null | undefined) {
  if (!root) return;
  root.classList.remove(...FURIGANA_CLASSES);
  const mode = useSettingsStore.getState().furiganaMode;
  if (mode && mode !== "show") root.classList.add(`aoz-furigana-${mode}`);
}

/** Click-to-reveal for the toggle/full/partial furigana modes. Delegated on the
 *  persistent content root so it survives paginated section swaps. */
function bindRubyReveal(root: Element | null | undefined) {
  if (!root) return;
  root.addEventListener("click", (e) => {
    const ruby = e.target instanceof Element ? e.target.closest("ruby") : null;
    if (!ruby) return;
    const mode = useSettingsStore.getState().furiganaMode;
    if (mode === "show" || mode === "hide") return;
    if (mode === "toggle") ruby.classList.toggle("reveal-rt");
    else ruby.classList.add("reveal-rt"); // partial, full: reveal and keep
  });
}

const formatMB = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** Download overlay for large epubs: a determinate bar + "X% • loaded / total"
 *  when Content-Length is known, else an indeterminate bar + MB downloaded. */
function LoadingProgress({ download }: { download: DownloadProgress }) {
  const { loaded, total } = download;
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  return (
    <div className="flex w-56 max-w-[70vw] flex-col items-center gap-3">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full bg-muted-foreground/70 ${pct === null ? "w-1/3 animate-pulse" : "transition-[width] duration-200 ease-out"}`}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {pct === null ? `Loading… ${formatMB(loaded)}` : `${pct}% · ${formatMB(loaded)} / ${formatMB(total!)}`}
      </p>
    </div>
  );
}

/**
 * Reader shell. The book is parsed once (or loaded from the IndexedDB cache) and
 * rendered inside a shadow root so the book's own CSS stays isolated. Continuous
 * and paginated layouts share that parsed content without re-parsing.
 *
 * Reading position is a character offset (exploredCharCount), so it survives
 * re-flow and mode switches; persisted (debounced) and restored on next open.
 */
export function ReaderView() {
  const book = useReaderStore((s) => s.currentBook);
  const close = useReaderStore((s) => s.close);

  const fontSize = useSettingsStore((s) => s.fontSize);
  const lineHeight = useSettingsStore((s) => s.lineHeight);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const theme = useSettingsStore((s) => s.theme);
  const readingMode = useSettingsStore((s) => s.readingMode);
  const writingMode = useSettingsStore((s) => s.writingMode);
  const furiganaMode = useSettingsStore((s) => s.furiganaMode);
  const pageColumns = useSettingsStore((s) => s.pageColumns);
  const sideMargin = useSettingsStore((s) => s.sideMargin);
  const customFonts = useFontsStore((s) => s.customFonts);
  const fullscreen = useUiStore((s) => s.fullscreen);

  const hostRef = useRef<HTMLDivElement>(null);
  const parsedRef = useRef<ParsedBook | null>(null);
  const htmlRef = useRef<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const anchorsRef = useRef<{ anchors: Anchor[]; total: number }>({ anchors: [], total: 0 });
  const controllerRef = useRef<PaginatedController | null>(null);
  const fixedRef = useRef<FixedLayoutHandle | null>(null);
  const fixedDataRef = useRef<{ pages: FixedLayoutPage[]; ppd: string; bookViewport: { width: number; height: number } | null; renditionSpread: RenditionSpread } | null>(null);
  const totalRef = useRef(0);
  const verticalRef = useRef(false);
  const modeRef = useRef<"continuous" | "paginated" | "fixed">(readingMode);
  const charRef = useRef(0);
  const rafRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wheelTsRef = useRef(0);
  const readyRef = useRef(false);
  const footnotesRef = useRef<Map<string, string>>(new Map()); // id → note inner HTML

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bookTitle, setBookTitle] = useState(""); // real EPUB <dc:title>, resolved after parse
  const [download, setDownload] = useState<DownloadProgress | null>(null); // null = not downloading (cached or done)
  const [parseToken, setParseToken] = useState(0); // bumped when parsed content is ready
  const [fixedLayout, setFixedLayout] = useState(false); // manga / fixed-layout book
  // Effective writing direction (see resolveVertical); drives the host overflow axis.
  const [vertical, setVertical] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [currentChar, setCurrentChar] = useState(0);
  const [pageInfo, setPageInfo] = useState<{ page: number; totalPages: number } | null>(null); // paginated mode
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [illustrations, setIllustrations] = useState<Illustration[]>([]);
  const [footnote, setFootnote] = useState<{ html: string; anchor: DOMRect } | null>(null);

  // Mirrors whether any reader overlay (panel/gallery) is open, so the global
  // page-flip key handler can stand down instead of flipping pages behind it.
  // Assigned below, once the search hook has surfaced its `searchOpen` state.
  const panelOpenRef = useRef(false);

  const total = totalRef.current;
  // Fixed-layout position is a page ordinal, so the last page (total-1) is 100%;
  // reflowable position is a character offset out of the total.
  const progressPct = total ? Math.round((fixedLayout && total > 1 ? currentChar / (total - 1) : currentChar / total) * 100) : 0;

  // Chapters that carry a TOC label (sub-sections fold into their parent).
  const chapters = useMemo(() => sections.filter((s) => s.label), [sections]);
  const activeChapterIndex = useMemo(() => chapterIndexAt(chapters, currentChar), [chapters, currentChar]);
  const activeChapterId = activeChapterIndex >= 0 ? chapters[activeChapterIndex].reference : null;

  /** Persists the current position to IndexedDB. */
  const persist = useCallback(() => {
    const totalChars = totalRef.current;
    if (!book || !totalChars) return;
    const exploredCharCount = charRef.current;
    const progress = Math.min(1, Math.max(0, exploredCharCount / totalChars));
    void saveProgress(book.id, { exploredCharCount, charCount: totalChars, progress, lastOpenedAt: Date.now() });
  }, [book]);

  /** Scrolls the continuous reader to the tracked character (or the book start). */
  const restoreContinuous = useCallback((vert: boolean) => {
    const host = hostRef.current;
    if (!host) return;
    const { anchors, total: totalChars } = anchorsRef.current;
    const char = charRef.current;
    if (char > 0 && totalChars > 0) {
      scrollToChar(host, anchors, vert, char);
    } else if (vert) {
      host.scrollLeft = host.scrollWidth; // vertical-rl begins at the right edge
    } else {
      host.scrollTop = 0;
    }
  }, []);

  /** After a continuous-mode jump settles, read the centred character and persist
   *  it. Run inside a rAF so the scroll has landed before measuring. */
  const commitContinuousChar = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    charRef.current = currentCharAtCenter(host, anchorsRef.current.anchors, verticalRef.current);
    setCurrentChar(charRef.current);
    persist();
  }, [persist]);

  const clearFootnote = useCallback(() => setFootnote(null), []);
  // The web port has no hover dictionary, so there's no lookup popup to clear;
  // the highlights hook still expects the callback, so pass a stable no-op.
  const clearLookup = useCallback(() => {}, []);

  // Text highlights + notes: list, pending-selection trigger, and colour/note
  // editor. Char-offset anchored, so the shell repaints on content rebuild and
  // paginated section swaps via the returned repaintAnnotations.
  const {
    annotations,
    annoPopover,
    annoTrigger,
    repaintAnnotations,
    closeAnnoPopover,
    clearAnnoTrigger,
    setPopoverNote,
    handleAnnoColor,
    handleRemoveAnnotation,
    openAnnoEditor,
    handleMouseUp,
    openHighlightAtPoint,
  } = useAnnotations({
    book,
    parseToken,
    readingMode,
    hostRef,
    modeRef,
    controllerRef,
    readyRef,
    totalRef,
    clearLookup,
    clearFootnote,
  });

  // Receives position updates from the paginated controller.
  const onPagedChange = useCallback(
    (state: PaginatedState) => {
      charRef.current = state.char;
      setCurrentChar(state.char);
      setPageInfo({ page: state.page, totalPages: state.totalPages });
      setFootnote(null);
      clearAnnoTrigger(); // the pending selection flipped away
      closeAnnoPopover(); // its anchored selection flipped away
      repaintAnnotations(); // the new section's highlights (previous section's cleared)
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(persist, 800);
    },
    [persist, repaintAnnotations, closeAnnoPopover, clearAnnoTrigger],
  );

  // Position updates from the fixed-layout viewer: a 0-based page ordinal. Progress
  // reaches 1 on the last page so finished manga count as read.
  const onFixedChange = useCallback(
    (ordinal: number, totalPages: number) => {
      charRef.current = ordinal;
      totalRef.current = totalPages;
      setCurrentChar(ordinal);
      setPageInfo({ page: ordinal, totalPages });
      if (!book || !totalPages) return;
      const progress = totalPages > 1 ? Math.min(1, ordinal / (totalPages - 1)) : 1;
      void saveProgress(book.id, { exploredCharCount: ordinal, charCount: totalPages, progress, lastOpenedAt: Date.now() });
    },
    [book],
  );

  // Jumps to a character offset, in whichever mode is active.
  const jumpToChar = useCallback(
    (char: number) => {
      setBookmarksOpen(false);
      charRef.current = char;
      if (modeRef.current === "fixed") {
        fixedRef.current?.jumpToOrdinal(char); // emits onChange → updates state + saves
        return;
      }
      if (modeRef.current === "paginated") {
        controllerRef.current?.restoreToChar(char); // emits onChange → updates state + saves
        return;
      }
      const host = hostRef.current;
      if (!host) return;
      scrollToChar(host, anchorsRef.current.anchors, verticalRef.current, char);
      requestAnimationFrame(commitContinuousChar);
    },
    [commitContinuousChar],
  );

  // Bookmarks and in-book search hang off the live position refs and jumpToChar;
  // each owns its own list/query state (loaded + reset per book internally).
  const { bookmarks, nameInput, setNameInput, computeDefaultName, addBookmark, removeBookmark } = useBookmarks({
    book,
    chapters,
    totalRef,
    charRef,
  });
  const { searchOpen, setSearchOpen, searchQuery, runSearch, searchResults, searchDisplay, jumpToSearchResult } = useReaderSearch({
    book,
    chapters,
    total,
    hostRef,
    modeRef,
    charRef,
    parsedRef,
    controllerRef,
    jumpToChar,
  });

  panelOpenRef.current = tocOpen || settingsOpen || bookmarksOpen || searchOpen || galleryOpen || annotationsOpen;

  // Expose the reader area's pixel size as inherited CSS vars so illustrations
  // can be capped against it, and re-paginate the page-flip reader on resize.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      host.style.setProperty("--reader-h", `${host.clientHeight}px`);
      host.style.setProperty("--reader-w", `${host.clientWidth}px`);
      if (modeRef.current === "paginated" && readyRef.current) {
        controllerRef.current?.refresh();
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // --- Load: parse (or load cached) once per book, independent of mode. ------
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    const prevDocTitle = document.title;

    readyRef.current = false;
    anchorsRef.current = { anchors: [], total: 0 };
    controllerRef.current?.destroy();
    controllerRef.current = null;
    fixedDataRef.current = null;
    htmlRef.current = null;
    parsedRef.current = null;
    totalRef.current = 0;
    charRef.current = 0;
    setBookTitle("");
    setDownload(null);
    setCurrentChar(0);
    setPageInfo(null);
    setFixedLayout(false);
    setSections([]);
    clearSearchHighlight();

    (async () => {
      setStatus("loading");
      try {
        let parsed = await getCachedBook(book.id, book.key);
        if (!parsed) {
          // Stream download progress (dominant wait for large epubs); once the
          // bytes are in, clearing it flips the overlay to the "Processing…"
          // (decrypt + parse) phase, which has no granular progress.
          const blob = await readBookBlob(book, (p) => {
            if (!cancelled) setDownload(p);
          });
          if (cancelled) return;
          setDownload(null);
          parsed = await parseBook(blob);
          await putCachedBook(book.id, parsed, book.key);
        }
        if (cancelled) return;

        // Reflect the real EPUB title in the browser tab and the reader header
        // once known; the original document title is restored on unmount/book
        // change. Falls back to the filename-derived title if the EPUB has none.
        setBookTitle(parsed.title || book.title);
        if (parsed.title) document.title = parsed.title;

        const { html, objectUrls, keyToUrl } = buildReaderHtml(parsed.elementHtml, parsed.blobs);
        objectUrlsRef.current = objectUrls;
        parsedRef.current = parsed;
        htmlRef.current = html;
        footnotesRef.current = parsed.fixedLayout ? new Map() : collectFootnotes(html);
        // Gallery images share the object URLs above, so their lifetime is tied
        // to this book load (revoked together on unmount/book change).
        setIllustrations(parsed.fixedLayout ? [] : collectIllustrations(parsed.elementHtml, keyToUrl));
        const initialVertical = resolveVertical(useSettingsStore.getState().writingMode, parsed.vertical);
        verticalRef.current = initialVertical;
        charRef.current = book.exploredCharCount || 0;
        if (parsed.fixedLayout) {
          fixedDataRef.current = { pages: parsed.pages || [], ppd: parsed.ppd, bookViewport: parsed.bookViewport, renditionSpread: parsed.renditionSpread };
        }
        setVertical(initialVertical);
        setFixedLayout(!!parsed.fixedLayout);
        setSections(parsed.sections || []);
        setParseToken((t) => t + 1); // hand off to the render effect
      } catch (err) {
        console.error("Failed to open book", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      document.title = prevDocTitle;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [book]);

  // --- Render: (re)build the shadow content for the current mode. ------------
  // Runs when parsed content becomes ready and whenever the reading mode toggles
  // — never re-parsing, only re-laying-out, carrying the character position.
  useEffect(() => {
    const parsed = parsedRef.current;
    if (!parsed) return;

    // Fixed-layout renders through <FixedLayoutView>, which owns its own shadow
    // DOM and navigation. Nothing to build here — just mark it ready.
    if (parsed.fixedLayout) {
      modeRef.current = "fixed";
      readyRef.current = true;
      setStatus("ready");
      return;
    }

    const host = hostRef.current;
    const html = htmlRef.current;
    if (!host || !html) return;

    let cancelled = false;
    const vert = resolveVertical(writingMode, parsed.vertical);
    verticalRef.current = vert;
    setVertical(vert);
    const mode = readingMode;
    modeRef.current = mode;
    readyRef.current = false;
    setStatus("loading");

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    applyReaderVars(host, useSettingsStore.getState(), useFontsStore.getState().customFonts);

    if (mode === "paginated") {
      shadow.innerHTML = `<style data-aoz-base>${paginatedStyles(vert)}</style><style>${parsed.styleSheet}</style><div class="aozora-content"><div class="aoz-page-content"></div></div>`;
      const scrollEl = shadow.querySelector(".aozora-content") as HTMLElement;
      const contentEl = shadow.querySelector(".aoz-page-content") as HTMLElement;
      applyFuriganaClass(scrollEl);
      bindRubyReveal(scrollEl);

      const temp = document.createElement("div");
      temp.innerHTML = html;
      // Mixed books: merge paired fixed-layout image pages into one spread
      // section so the controller renders them side by side on a single page.
      mergeSpreadSections(temp, parsed.spreadPairs, parsed.ppd);
      const sectionEls = Array.from(temp.children);

      const controller = new PaginatedController({
        scrollEl,
        contentEl,
        sections: sectionEls,
        vertical: vert,
        columns: useSettingsStore.getState().pageColumns,
        onChange: onPagedChange,
      });
      controllerRef.current = controller;
      totalRef.current = controller.charCount;

      (async () => {
        await controller.restoreToChar(charRef.current || 0);
        if (cancelled) return;
        readyRef.current = true;
        setStatus("ready");
        repaintAnnotations();
      })();
    } else {
      shadow.innerHTML = `<style data-aoz-base>${continuousStyles(vert)}</style><style>${parsed.styleSheet}</style><div class="aozora-content">${html}</div>`;
      const contentEl = shadow.querySelector(".aozora-content");
      applyFuriganaClass(contentEl);
      bindRubyReveal(contentEl);
      anchorsRef.current = collectAnchors(contentEl!);
      totalRef.current = anchorsRef.current.total;

      requestAnimationFrame(() => {
        if (cancelled) return;
        restoreContinuous(vert);
        charRef.current = currentCharAtCenter(host, anchorsRef.current.anchors, vert);
        setCurrentChar(charRef.current);
        readyRef.current = true;
        setStatus("ready");
        repaintAnnotations();
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(saveTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      persist();
      readyRef.current = false;
      clearSearchHighlight();
      clearAnnotationHighlights();
      controllerRef.current?.destroy();
      controllerRef.current = null;
      if (shadow) shadow.innerHTML = "";
    };
    // Content arrives via parseToken + the refs above; the omitted callbacks are
    // stable, so re-running on them would only re-layout. writingMode is here so
    // toggling text direction rebuilds the shadow content (position is char-based,
    // so it's preserved across the rebuild via charRef).
  }, [parseToken, readingMode, writingMode]);

  // Apply font/theme settings live, and re-flow to keep the reading position.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    applyReaderVars(host, { fontSize, lineHeight, fontFamily, theme, sideMargin }, customFonts);
    applyFuriganaClass(host.shadowRoot?.querySelector(".aozora-content"));
    if (!readyRef.current) return;
    if (modeRef.current === "paginated") {
      // Column count change re-flows the multi-column layout; refresh re-measures
      // and lands back on the current character.
      if (controllerRef.current) controllerRef.current.columns = pageColumns;
      controllerRef.current?.refresh();
      return;
    }
    const id = requestAnimationFrame(() => restoreContinuous(verticalRef.current));
    return () => cancelAnimationFrame(id);
  }, [fontSize, lineHeight, fontFamily, theme, furiganaMode, pageColumns, sideMargin, customFonts, restoreContinuous]);

  // Page-flip helpers (forward = toward the end of the book, regardless of mode).
  const flipNext = useCallback(() => {
    controllerRef.current?.flipPage(1);
  }, []);
  const flipPrev = useCallback(() => {
    controllerRef.current?.flipPage(-1);
  }, []);

  // Keyboard navigation for the page-flip reader. The fixed-layout viewer owns
  // its own key handling, so the reflowable handler stands down for manga.
  useEffect(() => {
    if (fixedLayout || readingMode !== "paginated") return;
    const onKey = (e: KeyboardEvent) => {
      if (panelOpenRef.current) return; // a panel/gallery is open — don't flip pages behind it
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const vert = verticalRef.current;
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          if (vert) flipNext();
          else flipPrev();
          break;
        case "ArrowRight":
        case "KeyD":
          if (vert) flipPrev();
          else flipNext();
          break;
        case "ArrowDown":
        case "PageDown":
          flipNext();
          break;
        case "ArrowUp":
        case "PageUp":
          flipPrev();
          break;
        case "Space":
          if (e.shiftKey) flipPrev();
          else flipNext();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fixedLayout, readingMode, flipNext, flipPrev]);

  // Recompute the continuous character offset at the viewport centre
  // (rAF-throttled) and debounce a save.
  const handleScroll = () => {
    if (modeRef.current !== "continuous") return;
    setFootnote(null);
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const host = hostRef.current;
      if (!host || !anchorsRef.current.anchors.length) return;
      charRef.current = currentCharAtCenter(host, anchorsRef.current.anchors, verticalRef.current);
      setCurrentChar(charRef.current);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(persist, 800);
    });
  };

  // Wheel: continuous maps vertical wheel onto the horizontal axis for tategaki;
  // paginated flips one page per (throttled) wheel notch.
  const handleWheel = (e: React.WheelEvent) => {
    if (modeRef.current === "paginated") {
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      const now = Date.now();
      if (now - wheelTsRef.current < 250) return;
      wheelTsRef.current = now;
      if (delta > 0) flipNext();
      else flipPrev();
      return;
    }
    if (!verticalRef.current) return; // horizontal books scroll natively
    const host = hostRef.current;
    if (!host || host.scrollWidth <= host.clientWidth) return;
    if (e.deltaY !== 0) host.scrollLeft -= e.deltaY;
  };

  const jumpToReference = (reference: string) => {
    const host = hostRef.current;
    const shadow = host?.shadowRoot;
    if (!host || !shadow) return false;
    if (!scrollToElementId(host, shadow, reference, verticalRef.current)) {
      return false;
    }
    requestAnimationFrame(commitContinuousChar);
    return true;
  };

  const handleJump = (reference: string) => {
    setTocOpen(false);
    if (modeRef.current === "fixed") {
      fixedRef.current?.jumpToId(reference);
    } else if (modeRef.current === "paginated") {
      controllerRef.current?.jumpToSectionId(reference);
    } else {
      jumpToReference(reference);
    }
  };

  // Follow internal links in either mode. No click-to-flip (wheel/arrows only),
  // so text stays freely selectable.
  const handleContentClick = (e: React.MouseEvent) => {
    const path = (e.nativeEvent.composedPath?.() || []) as Element[];
    const anchor = path.find((n) => n?.tagName === "A");
    const href = anchor?.getAttribute("href");
    if (href && href[0] === "#") {
      const id = decodeURIComponent(href.slice(1));
      // A noteref opens the note in a popup instead of jumping away from the prose.
      const note = footnotesRef.current.get(id);
      if (note && anchor) {
        e.preventDefault();
        setFootnote({ html: note, anchor: anchor.getBoundingClientRect() });
        return;
      }
      if (modeRef.current === "paginated") {
        if (id && controllerRef.current?.jumpToSectionId(id)) e.preventDefault();
      } else if (id && jumpToReference(id)) {
        e.preventDefault();
      }
      return;
    }

    // Not a link: hand off to the highlights hook, which opens the editor if the
    // click landed on an existing highlight (and no selection is active).
    openHighlightAtPoint(e);
  };

  // A content rebuild or mode switch invalidates the open note anchor box.
  useEffect(() => {
    setFootnote(null);
  }, [parseToken, readingMode]);

  // F11 toggles fullscreen. Leaving the reader drops it so the user can't get
  // stuck with the title bar hidden on a page that has no toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (useUiStore.getState().fullscreen) toggleFullscreen();
    };
  }, []);

  if (!book) return null;

  const paged = readingMode === "paginated";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={close} aria-label="Back to library">
          <ArrowLeft className="size-4" />
        </Button>
        <p className="min-w-0 truncate text-xs font-medium tracking-tight">
          {status === "loading" ? "Loading..." : `【${bookTitle || book.title}】`}
        </p>
        {total > 0 && (
          <>
            <div className="h-4 w-px shrink-0 bg-border" />
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              {(paged || fixedLayout) && pageInfo && (
                <span className="tabular-nums">
                  {pageInfo.page + 1}
                  <span className="opacity-50">/{pageInfo.totalPages}</span>
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-14 overflow-hidden bg-muted">
                  <div className="h-full bg-muted-foreground/70 transition-[width] duration-300 ease-out" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums">{progressPct}%</span>
              </div>
            </div>
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={() => setTocOpen(true)} disabled={!chapters.length} aria-label="Table of contents">
          <List className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} disabled={!total || fixedLayout} aria-label="Search in book">
          <Search className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setGalleryOpen(true)} disabled={!illustrations.length} aria-label="Illustrations">
          <Images className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setNameInput(computeDefaultName());
            setBookmarksOpen(true);
          }}
          aria-label="Bookmarks"
        >
          <Bookmark className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setAnnotationsOpen(true)} disabled={!total || fixedLayout} aria-label="Highlights">
          <Highlighter className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Reader settings">
          <Settings className="size-4" />
        </Button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            {status === "error" ? (
              <p className="text-sm text-muted-foreground">Could not open this book.</p>
            ) : download ? (
              <LoadingProgress download={download} />
            ) : (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
        {fixedLayout ? (
          fixedDataRef.current && (
            <FixedLayoutView
              ref={fixedRef}
              html={htmlRef.current || ""}
              styleSheet={parsedRef.current?.styleSheet || ""}
              pages={fixedDataRef.current.pages}
              ppd={fixedDataRef.current.ppd}
              bookViewport={fixedDataRef.current.bookViewport}
              renditionSpread={fixedDataRef.current.renditionSpread}
              initialOrdinal={book.exploredCharCount || 0}
              onChange={onFixedChange}
            />
          )
        ) : (
          <div
            ref={hostRef}
            onWheel={handleWheel}
            onScroll={handleScroll}
            onClick={handleContentClick}
            onMouseUp={handleMouseUp}
            className={
              paged
                ? // Padding lives on the host (outside the shadow scroller) so it
                  // never disturbs the page-flip arithmetic; the scroller measures
                  // its own client box, so columns inset to match.
                  "h-full w-full overflow-hidden py-8 px-8"
                : vertical
                  ? "h-full w-full overflow-x-auto overflow-y-hidden"
                  : "h-full w-full overflow-y-auto overflow-x-hidden"
            }
          />
        )}
        <FootnotePopup html={footnote?.html ?? null} anchor={footnote?.anchor ?? null} onClose={() => setFootnote(null)} />
        <AnnotationTrigger point={annoTrigger?.point ?? null} onPick={openAnnoEditor} onClose={clearAnnoTrigger} />
        <AnnotationPopover
          anchor={annoPopover?.anchor ?? null}
          color={annoPopover?.color ?? DEFAULT_ANNOTATION_COLOR}
          note={annoPopover?.note ?? ""}
          isNew={!annoPopover?.id}
          onColor={handleAnnoColor}
          onNote={setPopoverNote}
          onDelete={annoPopover?.id ? () => handleRemoveAnnotation(annoPopover.id!) : undefined}
          onClose={closeAnnoPopover}
        />
      </div>

      <ReaderToc open={tocOpen} onOpenChange={setTocOpen} chapters={chapters} activeChapterId={activeChapterId} onJump={handleJump} />

      <ReaderBookmarks
        open={bookmarksOpen}
        onOpenChange={setBookmarksOpen}
        bookmarks={bookmarks}
        nameInput={nameInput}
        onNameInputChange={setNameInput}
        onAdd={addBookmark}
        onJump={jumpToChar}
        onRemove={removeBookmark}
      />

      <ReaderAnnotations
        open={annotationsOpen}
        onOpenChange={setAnnotationsOpen}
        annotations={annotations}
        onJump={jumpToChar}
        onRemove={handleRemoveAnnotation}
      />

      <ReaderSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        query={searchQuery}
        onQueryChange={runSearch}
        results={searchDisplay}
        total={searchResults.total}
        capped={searchResults.capped}
        onJump={jumpToSearchResult}
      />

      <ReaderGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        illustrations={illustrations}
        total={total}
        onSelect={(char) => {
          setGalleryOpen(false);
          jumpToChar(char);
        }}
      />

      <ReaderSettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} fixedLayout={fixedLayout} vertical={vertical} />
    </div>
  );
}
