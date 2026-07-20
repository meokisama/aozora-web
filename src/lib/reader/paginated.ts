/**
 * Paginated (page-flip) reader over CSS multi-column layout. One spine section
 * (`aoz-<idref>`) renders at a time, so each chapter starts on a fresh page:
 *   - vertical-rl: `column-width = viewport height` — paged via `scrollTop`.
 *   - horizontal-tb: `column-width = viewport width` — paged via `scrollLeft`;
 *     trailing partial page pulled in with `translateX`.
 * Page stride = viewport + gap.
 *
 * Position is char-based (same as continuous reader) so mode switches preserve
 * place. Per section: record each paragraph's leading-edge offset, snap to a
 * page, keep a `page → first char` map for save/restore.
 */

import { getParagraphNodes, getCharacterCount, countCharacters } from "@/lib/epub/dom-utils";

/** Inter-page gap (matches reference reader). */
export const PAGE_GAP = 40;

export interface PaginatedState {
  char: number;
  page: number;
  totalPages: number;
  sectionIndex: number;
}

export interface PaginatedOptions {
  /** The overflow-hidden viewport element. */
  scrollEl: HTMLElement;
  /** The multi-column container inside it. */
  contentEl: HTMLElement;
  /** Detached `aoz-<idref>` section elements. */
  sections: Element[];
  /** true for tategaki (vertical-rl). */
  vertical: boolean;
  /** Columns per page for horizontal mode; 0 = auto, ignored when vertical. */
  columns?: number;
  onChange?: (state: PaginatedState) => void;
}

export type Landing = "start" | "end" | { char: number };

function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}

/** Wait two frames for layout to settle after swapping section HTML. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Bounding rect for a node (text nodes measured via a Range). */
function nodeRect(node: Node): DOMRect {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  return rect;
}

export class PaginatedController {
  scrollEl: HTMLElement;
  contentEl: HTMLElement;
  sections: Element[];
  vertical: boolean;
  /** Raw columns setting (0 = auto); resolved in `_effectiveColumns`. */
  columns: number;
  onChange: (state: PaginatedState) => void;
  gap: number;

  sectionIndex: number;
  page: number;
  totalPages: number;
  translate: number;

  contentW: number;
  contentH: number;

  pageStartChar: number[];
  sectionAccChar: number[];
  charCount: number;

  destroyed: boolean;

  constructor({ scrollEl, contentEl, sections, vertical, columns, onChange }: PaginatedOptions) {
    this.scrollEl = scrollEl;
    this.contentEl = contentEl;
    this.sections = sections;
    this.vertical = vertical;
    this.columns = columns ?? 0;
    this.onChange = onChange || (() => {});
    this.gap = PAGE_GAP;

    this.sectionIndex = -1;
    this.page = 0;
    this.totalPages = 1;
    this.translate = 0;

    this.contentW = 0;
    this.contentH = 0;

    // Per-section paragraph stats (recomputed each render/reflow).
    this.pageStartChar = [0];

    // Cumulative char count at each section end. Counting is layout-independent,
    // so it runs on the detached elements up front.
    this.sectionAccChar = [];
    let acc = 0;
    for (const sec of sections) {
      acc += countCharacters(sec);
      this.sectionAccChar.push(acc);
    }
    this.charCount = acc;

    this.destroyed = false;
  }

  get sectionStart(): number {
    return this.sectionAccChar[this.sectionIndex - 1] || 0;
  }

  get viewportSize(): number {
    return this.vertical ? this.contentH : this.contentW;
  }

  get screenSize(): number {
    return this.viewportSize + this.gap;
  }

  get scrollSizeProp(): "scrollHeight" | "scrollWidth" {
    return this.vertical ? "scrollHeight" : "scrollWidth";
  }

  /** Current char offset (section start + current page start). */
  get exploredChar(): number {
    return this.sectionStart + (this.pageStartChar[this.page] || 0);
  }

  /**
   * Columns per page. Vertical is always single-column; horizontal honours the
   * setting, or auto (`0`) scales with viewport width (~1 col / 1000px).
   */
  _effectiveColumns(): number {
    if (this.vertical) return 1;
    if (this.columns > 0) return this.columns;
    return Math.max(1, Math.ceil(this.contentW / 1000));
  }

  /** True when a section has no flowable text (cover / full-page illustration). */
  _isImageSection(index: number): boolean {
    if (index < 0) return false;
    const start = this.sectionAccChar[index - 1] || 0;
    return this.sectionAccChar[index] - start === 0;
  }

  /** Sizes the column container against the padding-excluded viewport box. */
  _applyColumnSizes(): void {
    const cs = getComputedStyle(this.scrollEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    this.contentW = Math.max(0, this.scrollEl.clientWidth - padX);
    this.contentH = Math.max(0, this.scrollEl.clientHeight - padY);

    const el = this.contentEl;
    el.style.columnGap = `${this.gap}px`;
    el.style.columnFill = "auto";

    // Image-only sections would otherwise sit flush against the block-start edge
    // (right in vertical-rl). Centre them in a viewport-filling flex box.
    if (this._isImageSection(this.sectionIndex)) {
      this._clearTransform();
      el.style.columnWidth = "auto";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.width = "100%";
      el.style.height = `${this.contentH}px`;
      return;
    }

    // Restore multi-column layout (a prior image section may have left it flex).
    el.style.display = "";
    el.style.alignItems = "";
    el.style.justifyContent = "";
    if (this.vertical) {
      // The trick that makes vertical-rl multicol page correctly.
      el.style.columnWidth = `${this.contentH}px`;
      el.style.width = "100%";
      el.style.height = "auto";
    } else {
      // Pack N columns into one viewport-wide page: N*colW + (N-1)*gap = contentW.
      // Stride stays viewport+gap, so the next page's first column lands one screen over.
      const cols = this._effectiveColumns();
      const colW = cols > 1 ? (this.contentW - (cols - 1) * this.gap) / cols : this.contentW;
      el.style.columnWidth = `${colW}px`;
      el.style.width = "auto";
      el.style.height = `${this.contentH}px`;
    }
  }

  _clearTransform(): void {
    if (this.translate) {
      this.contentEl.style.transform = "";
      this.translate = 0;
    }
  }

  _resetScroll(): void {
    this._clearTransform();
    this.scrollEl.scrollLeft = 0;
    this.scrollEl.scrollTop = 0;
  }

  /**
   * Measures the rendered section: each paragraph's leading-edge scroll-axis
   * offset, the page it snaps to, and the `page → first char` map. Scroll is
   * reset first so offsets are absolute within the section.
   */
  _measure(): void {
    this._resetScroll();

    const contentRect = this.contentEl.getBoundingClientRect();
    const nodes = getParagraphNodes(this.contentEl);
    const screen = this.screenSize;
    const scrollSize = this.scrollEl[this.scrollSizeProp];
    this.totalPages = Math.max(1, Math.ceil(scrollSize / screen));

    const pageFirstChar: number[] = new Array(this.totalPages);

    let acc = 0;
    let prevPos = 0; // zero-size node (empty wrapper) inherits the last edge
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const r = nodeRect(node);
      const size = this.vertical ? r.height : r.width;
      const pos = size <= 0 ? prevPos : this.vertical ? r.top - contentRect.top : r.left - contentRect.left;
      prevPos = pos;

      // floor, not round: a paragraph beginning in a column's latter half still
      // belongs to that column's page (rounding forward jumps search hits astray).
      const pg = clamp(Math.floor(pos / screen), 0, this.totalPages - 1);
      if (pageFirstChar[pg] === undefined) pageFirstChar[pg] = acc;

      acc += getCharacterCount(node);
    }

    // A page with no paragraph start (long paragraph spilling over) inherits the
    // previous page's start, keeping the map non-decreasing.
    this.pageStartChar = new Array(this.totalPages);
    let carry = 0;
    for (let p = 0; p < this.totalPages; p += 1) {
      if (pageFirstChar[p] === undefined) {
        this.pageStartChar[p] = carry;
      } else {
        this.pageStartChar[p] = pageFirstChar[p];
        carry = pageFirstChar[p];
      }
    }
    if (this.pageStartChar.length === 0) this.pageStartChar = [0];
  }

  /** Last page whose first char is at or before `within` (section-local). */
  _pageForCharWithin(within: number): number {
    let best = 0;
    for (let p = 0; p < this.pageStartChar.length; p += 1) {
      if (this.pageStartChar[p] <= within) best = p;
      else break;
    }
    return best;
  }

  _scrollToPage(p: number): void {
    p = clamp(p, 0, this.totalPages - 1);
    this.page = p;

    const pos = p * this.screenSize;
    const scrollSize = this.scrollEl[this.scrollSizeProp];

    if (this.vertical) {
      this._clearTransform();
      this.scrollEl.scrollTop = Math.min(pos, Math.max(0, scrollSize - this.contentH));
    } else if (pos + this.contentW <= scrollSize) {
      this._clearTransform();
      this.scrollEl.scrollLeft = pos;
    } else {
      // Trailing partial page: scrollLeft can't reach it, so translate it in.
      this.scrollEl.scrollLeft = 0;
      this.contentEl.style.transform = `translateX(${-pos}px)`;
      this.translate = -pos;
    }

    this._emit();
  }

  _emit(): void {
    this.onChange({
      char: this.exploredChar,
      page: this.page,
      totalPages: this.totalPages,
      sectionIndex: this.sectionIndex,
    });
  }

  /** Renders a section and lands on a page. */
  async setSection(index: number, landing?: Landing): Promise<void> {
    index = clamp(index, 0, this.sections.length - 1);
    this.sectionIndex = index;
    // Hide during swap+measure to avoid the page-0 flash before landing (chapter-
    // switch jitter). visibility keeps layout geometry intact for _measure,
    // unlike display:none.
    this.contentEl.style.visibility = "hidden";
    this.contentEl.innerHTML = this.sections[index].outerHTML;

    await nextFrame();
    if (this.destroyed) return;

    this._applyColumnSizes();
    this._measure();

    let page = 0;
    if (landing === "end") page = this.totalPages - 1;
    else if (landing && typeof landing === "object" && typeof landing.char === "number") {
      page = this._pageForCharWithin(landing.char - this.sectionStart);
    }
    this._scrollToPage(page);
    this.contentEl.style.visibility = "";
  }

  /** Advances (dir=1) or rewinds (dir=-1) one page, crossing sections. */
  async flipPage(dir: number): Promise<void> {
    const next = this.page + dir;
    if (next < 0) {
      if (this.sectionIndex > 0) await this.setSection(this.sectionIndex - 1, "end");
      return;
    }
    if (next >= this.totalPages) {
      if (this.sectionIndex < this.sections.length - 1) {
        await this.setSection(this.sectionIndex + 1, "start");
      }
      return;
    }
    this._scrollToPage(next);
  }

  /** Restores the reader to a global char offset. */
  async restoreToChar(char: number): Promise<void> {
    // Start of book = section 0, page 0. Skip the search: cover/front are 0-char
    // image sections, so `sectionAccChar <= 0` would skip past them to the first
    // text section.
    if (char <= 0) {
      await this.setSection(0, "start");
      return;
    }
    let index = 0;
    while (index < this.sectionAccChar.length - 1 && this.sectionAccChar[index] <= char) {
      index += 1;
    }
    await this.setSection(index, { char });
  }

  /** Jumps to the section containing a TOC id (the id or a descendant). */
  jumpToSectionId(id: string): boolean {
    const index = this.sections.findIndex((s) => s.id === id || s.querySelector(`[id="${CSS.escape(id)}"]`));
    if (index < 0) return false;
    this.setSection(index, "start");
    return true;
  }

  /** Re-paginates the current section after resize or font/spacing change. */
  async refresh(): Promise<void> {
    if (this.sectionIndex < 0) return;
    const char = this.exploredChar;
    this._applyColumnSizes();
    await nextFrame();
    if (this.destroyed) return;
    this._measure();
    this._scrollToPage(this._pageForCharWithin(char - this.sectionStart));
  }

  destroy(): void {
    this.destroyed = true;
  }
}
