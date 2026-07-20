import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Global reader display prefs (Zustand persist). Applied live via CSS custom props on the shadow host; see `reader-view.jsx`. */

/** Built-in reader fonts. `fontFamily` is a `BuiltinFont` key or an imported font id, hence typed `string`. */
export type BuiltinFont = "mincho" | "noto-serif" | "noto-sans" | "gyosho" | "merriweather";
export type FontFamily = string;
export type ThemeName = "sepia" | "dark";
export type ReadingMode = "continuous" | "paginated";
export type FuriganaMode = "show" | "hide" | "partial" | "toggle" | "full";
export type MangaSpread = "auto" | "single" | "double";
export type MangaReadingMode = "paginated" | "continuous";
export type MangaScrollDirection = "vertical" | "horizontal";
export type WritingMode = "auto" | "horizontal" | "vertical";

/** CSS font-family stacks per built-in font (`@font-face` in index.css). */
export const FONT_STACKS: Record<BuiltinFont, string> = {
  mincho: "'Yu Mincho', YuMincho, 'Hiragino Mincho ProN', 'Noto Serif JP', 'MS Mincho', serif",
  "noto-serif": "'Noto Serif JP', serif",
  "noto-sans": "'Noto Sans JP', sans-serif",
  gyosho: "'EPGyosho', 'Noto Serif JP', 'Yu Mincho', YuMincho, serif",
  // Latin serif for Hako books; JP serif fallback for stray CJK.
  merriweather: "'Merriweather', 'Noto Serif JP', serif",
};

/** Built-in options for the Font dropdown (imported fonts appended at render time). */
export const FONT_FAMILIES: { value: BuiltinFont; label: string }[] = [
  { value: "noto-serif", label: "Noto Serif JP" },
  { value: "noto-sans", label: "Noto Sans JP" },
  { value: "mincho", label: "Yu Mincho" },
  { value: "gyosho", label: "Epson" },
  { value: "merriweather", label: "Merriweather" },
];

/** Colour themes (page bg + body text). `dark` toggles the doc root `.dark` class (Tailwind palette); the reader reads bg/color from here. */
export const THEMES: Record<ThemeName, { bg: string; color: string; dark: boolean }> = {
  sepia: { bg: "#faf8f4", color: "#1f1d1a", dark: false },
  // Warm charcoal + dimmed off-white; matches the app's dark surface, avoids pure black/white glare.
  dark: { bg: "#201f1c", color: "#cac4b8", dark: true },
};

export const FONT_SIZE_RANGE = { min: 14, max: 40, step: 0.5 };
export const LINE_HEIGHT_RANGE = { min: 1.2, max: 2.6, step: 0.05 };
/** Side margin (% of width) per edge for horizontal continuous reading. */
export const SIDE_MARGIN_RANGE = { min: 0, max: 30, step: 0.5 };
/** Page width (% of viewport) for the continuous manga strip. */
export const MANGA_STRIP_WIDTH_RANGE = { min: 30, max: 100, step: 1 };
/** Gap between pages (CSS px) in the continuous manga strip. */
export const MANGA_STRIP_GAP_RANGE = { min: 0, max: 40, step: 1 };

/** Columns per page (horizontal paginated only; vertical is always single-column). `0` = auto. */
export const PAGE_COLUMNS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Auto" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
];

/** Furigana display modes. Each mode but "show" maps to a `.aoz-furigana-<value>` class (see `reader-styles.js`). */
export const FURIGANA_MODES: { value: FuriganaMode; label: string }[] = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "partial", label: "Dimmed" },
  { value: "toggle", label: "Toggle (click)" },
  { value: "full", label: "Reveal (hover/click)" },
];

/**
 * Page layout for fixed-layout books (manga); reflowable novels ignore it.
 *   - auto:   follow OPF rendition:spread (absent defaults to landscape)
 *   - single: always one page (overrides the book)
 *   - double: always a spread (overrides the book)
 */
export const MANGA_SPREAD_MODES: { value: MangaSpread; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "single", label: "Single" },
  { value: "double", label: "Spread" },
];

/**
 * Navigation model for fixed-layout books (manga), orthogonal to mangaSpread.
 *   - paginated:  one spread at a time, flip to advance
 *   - continuous: long-strip, free scroll
 */
export const MANGA_READING_MODES: { value: MangaReadingMode; label: string }[] = [
  { value: "paginated", label: "Paginated" },
  { value: "continuous", label: "Continuous" },
];

/**
 * Scroll axis for the continuous manga strip.
 *   - vertical:   webtoon, scroll down
 *   - horizontal: filmstrip in book progression direction (RTL for RTL manga)
 */
export const MANGA_SCROLL_DIRECTIONS: { value: MangaScrollDirection; label: string }[] = [
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
];

/** Text directions. `auto` follows each EPUB's PPD/CSS; `horizontal`/`vertical` force a global override until reset to `auto`. */
export const WRITING_MODES: { value: WritingMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
];

/**
 * Independent profiles so books in different scripts keep their own prefs. Opening a book
 * activates its profile; setters write the active profile, and the flat `SettingsState`
 * fields mirror it so consumers (`s.fontSize`) need no change.
 *   - `default`: Japanese/CJK (tategaki, mincho, paginated).
 *   - `hako`:    Hako light novels (see `HAKO_PRESET`).
 */
export type SettingsProfile = "default" | "hako";

interface SettingsState {
  activeProfile: SettingsProfile;
  profiles: Record<SettingsProfile, SettingsData>;
  setActiveProfile: (profile: SettingsProfile) => void;
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamily;
  theme: ThemeName;
  readingMode: ReadingMode;
  furiganaMode: FuriganaMode;
  mangaSpread: MangaSpread;
  mangaReadingMode: MangaReadingMode;
  mangaScrollDirection: MangaScrollDirection;
  mangaStripWidth: number;
  mangaStripGap: number;
  writingMode: WritingMode;
  pageColumns: number;
  sideMargin: number;
  discordRichPresence: boolean;
  discordCover: boolean;
  setFontSize: (fontSize: number) => void;
  setLineHeight: (lineHeight: number) => void;
  setFontFamily: (fontFamily: FontFamily) => void;
  setTheme: (theme: ThemeName) => void;
  setReadingMode: (readingMode: ReadingMode) => void;
  setFuriganaMode: (furiganaMode: FuriganaMode) => void;
  setMangaSpread: (mangaSpread: MangaSpread) => void;
  setMangaReadingMode: (mangaReadingMode: MangaReadingMode) => void;
  setMangaScrollDirection: (mangaScrollDirection: MangaScrollDirection) => void;
  setMangaStripWidth: (mangaStripWidth: number) => void;
  setMangaStripGap: (mangaStripGap: number) => void;
  setWritingMode: (writingMode: WritingMode) => void;
  setPageColumns: (pageColumns: number) => void;
  setSideMargin: (sideMargin: number) => void;
  setDiscordRichPresence: (discordRichPresence: boolean) => void;
  setDiscordCover: (discordCover: boolean) => void;
  reset: () => void;
}

type SettingsData = Pick<
  SettingsState,
  | "fontSize"
  | "lineHeight"
  | "fontFamily"
  | "theme"
  | "readingMode"
  | "furiganaMode"
  | "mangaSpread"
  | "mangaReadingMode"
  | "mangaScrollDirection"
  | "mangaStripWidth"
  | "mangaStripGap"
  | "writingMode"
  | "pageColumns"
  | "sideMargin"
  | "discordRichPresence"
  | "discordCover"
>;

const DEFAULTS: SettingsData = {
  fontSize: 21, // px
  lineHeight: 1.8,
  fontFamily: "mincho",
  theme: "sepia",
  readingMode: "paginated",
  furiganaMode: "show",
  mangaSpread: "auto",
  mangaReadingMode: "paginated",
  mangaScrollDirection: "vertical",
  mangaStripWidth: 100, // % of the fit axis
  mangaStripGap: 12, // px between strip pages
  writingMode: "auto",
  pageColumns: 0, // auto
  sideMargin: 12, // % per edge
  discordRichPresence: true, // opt-out; shares current book to Discord
  discordCover: true, // opt-out; uploads cover to catbox.moe for the large image
};

/** Fields the `hako` profile overrides out of the box; the rest is shared with `DEFAULTS`. Still user-editable (sticks to the `hako` profile). */
export const HAKO_PRESET: Partial<SettingsData> = {
  writingMode: "horizontal",
  readingMode: "continuous",
  sideMargin: 25, // % per edge
  fontFamily: "merriweather",
};

const HAKO_DEFAULTS: SettingsData = { ...DEFAULTS, ...HAKO_PRESET };

/** Persisted keys; used to lift a pre-profiles (v0) blob into the `default` profile on migration. */
const SETTINGS_KEYS = Object.keys(DEFAULTS) as (keyof SettingsData)[];
function extractSettings(src: Record<string, unknown>): Partial<SettingsData> {
  const out: Partial<SettingsData> = {};
  for (const k of SETTINGS_KEYS) if (k in src) (out as Record<string, unknown>)[k] = src[k];
  return out;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => {
      // Write the field to both the flat state (consumers read) and the active profile (persists per book type).
      const patch = (p: Partial<SettingsData>) =>
        set((s) => ({
          ...p,
          profiles: { ...s.profiles, [s.activeProfile]: { ...s.profiles[s.activeProfile], ...p } },
        }));
      return {
        activeProfile: "default",
        profiles: { default: { ...DEFAULTS }, hako: { ...HAKO_DEFAULTS } },
        ...DEFAULTS,
        // Pull the target profile's values into the flat state. No-op if already active (avoids a re-render).
        setActiveProfile: (profile) =>
          set((s) => (s.activeProfile === profile ? {} : { activeProfile: profile, ...s.profiles[profile] })),
        setFontSize: (fontSize) => patch({ fontSize }),
        setLineHeight: (lineHeight) => patch({ lineHeight }),
        setFontFamily: (fontFamily) => patch({ fontFamily }),
        setTheme: (theme) => patch({ theme }),
        setReadingMode: (readingMode) => patch({ readingMode }),
        setFuriganaMode: (furiganaMode) => patch({ furiganaMode }),
        setMangaSpread: (mangaSpread) => patch({ mangaSpread }),
        setMangaReadingMode: (mangaReadingMode) => patch({ mangaReadingMode }),
        setMangaScrollDirection: (mangaScrollDirection) => patch({ mangaScrollDirection }),
        setMangaStripWidth: (mangaStripWidth) => patch({ mangaStripWidth }),
        setMangaStripGap: (mangaStripGap) => patch({ mangaStripGap }),
        setWritingMode: (writingMode) => patch({ writingMode }),
        setPageColumns: (pageColumns) => patch({ pageColumns }),
        setSideMargin: (sideMargin) => patch({ sideMargin }),
        setDiscordRichPresence: (discordRichPresence) => patch({ discordRichPresence }),
        setDiscordCover: (discordCover) => patch({ discordCover }),
        // Reset the active profile to its own baseline (hako keeps its preset).
        reset: () =>
          set((s) => {
            const base = s.activeProfile === "hako" ? HAKO_DEFAULTS : DEFAULTS;
            return { ...base, profiles: { ...s.profiles, [s.activeProfile]: { ...base } } };
          }),
      };
    },
    {
      name: "aozora-reader-settings",
      version: 1,
      // v0 stored settings flat: lift into `default`, seed `hako`, so existing users keep their prefs.
      migrate: (persisted: unknown, version: number) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version >= 1 && p.profiles) return p;
        const def = { ...DEFAULTS, ...extractSettings(p) };
        return { ...p, ...def, profiles: { default: def, hako: { ...HAKO_DEFAULTS } }, activeProfile: "default" };
      },
    },
  ),
);
