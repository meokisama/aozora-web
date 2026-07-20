import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useSettingsStore,
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  FONT_FAMILIES,
  FURIGANA_MODES,
  MANGA_SPREAD_MODES,
  MANGA_READING_MODES,
  MANGA_SCROLL_DIRECTIONS,
  WRITING_MODES,
  PAGE_COLUMNS_OPTIONS,
  SIDE_MARGIN_RANGE,
  MANGA_STRIP_WIDTH_RANGE,
  MANGA_STRIP_GAP_RANGE,
} from "@/stores/settings-store";
import { useFontsStore } from "@/stores/fonts-store";

interface FieldProps {
  label: string;
  value?: React.ReactNode;
  children: React.ReactNode;
}

/** A labelled row wrapping one control. */
function Field({ label, value, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        {value != null && <span className="text-xs tabular-nums text-muted-foreground">{value}</span>}
      </div>
      {children}
    </div>
  );
}

interface SmoothSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
  /** Formats the live value shown beside the label. */
  format?: (value: number) => React.ReactNode;
}

/** Slider that drags against local state, committing to the store only on drag end
 *  so re-layout fires once on release, not per pixel. */
function SmoothSlider({ label, value, min, max, step, onCommit, format }: SmoothSliderProps) {
  const [local, setLocal] = useState(value);

  // Follow external changes (e.g. reset); `value` is stable during a drag, so no conflict.
  useEffect(() => setLocal(value), [value]);

  return (
    <Field label={label} value={format ? format(local) : local}>
      <Slider
        value={[local]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => onCommit(v)}
      />
    </Field>
  );
}

const segmented = {
  type: "single",
  variant: "outline",
  size: "sm",
  spacing: 0,
  className: "w-full",
} as const;

// ToggleGroup can clear the active item; ignore empty updates so a value stays selected.
const guard =
  <T extends string>(setter: (next: T) => void) =>
  (next: T) =>
    next && setter(next);

/** Reader settings drawer. Changes apply live and persist across sessions. */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedLayout?: boolean;
  /** Effective writing direction; gates horizontal-only controls and the auto chip highlight. */
  vertical?: boolean;
}

export function ReaderSettingsPanel({ open, onOpenChange, fixedLayout = false, vertical = true }: Props) {
  const { t } = useTranslation();
  // Parent owns only the always-shown settings (theme, manga spread, reset);
  // reflowable-only fields live in ReflowableFields, reading the store directly.
  const theme = useSettingsStore((s) => s.theme);
  const mangaSpread = useSettingsStore((s) => s.mangaSpread);
  const mangaReadingMode = useSettingsStore((s) => s.mangaReadingMode);
  const mangaScrollDirection = useSettingsStore((s) => s.mangaScrollDirection);
  const mangaStripWidth = useSettingsStore((s) => s.mangaStripWidth);
  const mangaStripGap = useSettingsStore((s) => s.mangaStripGap);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setMangaSpread = useSettingsStore((s) => s.setMangaSpread);
  const setMangaReadingMode = useSettingsStore((s) => s.setMangaReadingMode);
  const setMangaScrollDirection = useSettingsStore((s) => s.setMangaScrollDirection);
  const setMangaStripWidth = useSettingsStore((s) => s.setMangaStripWidth);
  const setMangaStripGap = useSettingsStore((s) => s.setMangaStripGap);
  const reset = useSettingsStore((s) => s.reset);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 gap-0 p-0 sm:max-w-80">
        <SheetHeader className="border-b">
          <SheetTitle>{t("reader.settings")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <Field label={t("reader.theme")}>
            <ToggleGroup {...segmented} value={theme} onValueChange={guard(setTheme)}>
              <ToggleGroupItem value="sepia" className="flex-1">
                {t("reader.sepia")}
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" className="flex-1">
                {t("reader.dark")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          {/* Manga books expose only reading mode + spread; text settings don't apply to image pages. */}
          {fixedLayout ? (
            <>
              <Field label={t("reader.readingModeGroup")}>
                <ToggleGroup {...segmented} value={mangaReadingMode} onValueChange={guard(setMangaReadingMode)}>
                  {MANGA_READING_MODES.map((m) => (
                    <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
                      {t(`options.mangaReading.${m.value}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>

              {/* Paginated flips spreads; continuous scrolls one strip with adjustable axis/size. */}
              {mangaReadingMode === "paginated" ? (
                <Field label={t("reader.pageLayout")}>
                  <ToggleGroup {...segmented} value={mangaSpread} onValueChange={guard(setMangaSpread)}>
                    {MANGA_SPREAD_MODES.map((m) => (
                      <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
                        {t(`options.spread.${m.value}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              ) : (
                <>
                  <Field label={t("reader.scrollDirection")}>
                    <ToggleGroup {...segmented} value={mangaScrollDirection} onValueChange={guard(setMangaScrollDirection)}>
                      {MANGA_SCROLL_DIRECTIONS.map((m) => (
                        <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
                          {t(`options.mangaScroll.${m.value}`)}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </Field>

                  <SmoothSlider
                    label={mangaScrollDirection === "horizontal" ? t("reader.pageHeight") : t("reader.pageWidth")}
                    value={mangaStripWidth}
                    min={MANGA_STRIP_WIDTH_RANGE.min}
                    max={MANGA_STRIP_WIDTH_RANGE.max}
                    step={MANGA_STRIP_WIDTH_RANGE.step}
                    format={(v) => `${v}%`}
                    onCommit={setMangaStripWidth}
                  />

                  <SmoothSlider
                    label={t("reader.pageGap")}
                    value={mangaStripGap}
                    min={MANGA_STRIP_GAP_RANGE.min}
                    max={MANGA_STRIP_GAP_RANGE.max}
                    step={MANGA_STRIP_GAP_RANGE.step}
                    format={(v) => `${v}px`}
                    onCommit={setMangaStripGap}
                  />
                </>
              )}
            </>
          ) : (
            <ReflowableFields vertical={vertical} />
          )}
        </div>

        <div className="p-4">
          <Button variant="outline" className="w-full" onClick={reset}>
            <RotateCcw className="size-3.5" />
            {t("reader.resetDefaults")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Settings for reflowable (text) books; `vertical` gates horizontal-only rows. */
function ReflowableFields({ vertical }: { vertical: boolean }) {
  const { t } = useTranslation();
  const fontSize = useSettingsStore((s) => s.fontSize);
  const lineHeight = useSettingsStore((s) => s.lineHeight);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const readingMode = useSettingsStore((s) => s.readingMode);
  const writingMode = useSettingsStore((s) => s.writingMode);
  const furiganaMode = useSettingsStore((s) => s.furiganaMode);
  const pageColumns = useSettingsStore((s) => s.pageColumns);
  const sideMargin = useSettingsStore((s) => s.sideMargin);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setLineHeight = useSettingsStore((s) => s.setLineHeight);
  const setFontFamily = useSettingsStore((s) => s.setFontFamily);
  const setReadingMode = useSettingsStore((s) => s.setReadingMode);
  const setFuriganaMode = useSettingsStore((s) => s.setFuriganaMode);
  const setWritingMode = useSettingsStore((s) => s.setWritingMode);
  const setPageColumns = useSettingsStore((s) => s.setPageColumns);
  const setSideMargin = useSettingsStore((s) => s.setSideMargin);

  const customFonts = useFontsStore((s) => s.customFonts);
  const importFont = useFontsStore((s) => s.importFromFile);
  const removeFont = useFontsStore((s) => s.remove);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      await importFont(file);
    } catch {
      toast.error(t("reader.fontLoadError"));
    }
  };

  return (
    <>
      <Field label={t("reader.writingMode")}>
        <ToggleGroup {...segmented} value={writingMode} onValueChange={guard(setWritingMode)}>
          {WRITING_MODES.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
              {t(`options.writing.${m.value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field label={t("reader.readingMode")}>
        <ToggleGroup {...segmented} value={readingMode} onValueChange={guard(setReadingMode)}>
          <ToggleGroupItem value="paginated" className="flex-1">
            {t("reader.paginated")}
          </ToggleGroupItem>
          <ToggleGroupItem value="continuous" className="flex-1">
            {t("reader.continuous")}
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {!vertical && readingMode === "paginated" && (
        <Field label={t("reader.columnsPerPage")}>
          <ToggleGroup {...segmented} value={String(pageColumns)} onValueChange={(v: string) => v && setPageColumns(Number(v))}>
            {PAGE_COLUMNS_OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={String(o.value)} className="flex-1">
                {o.value === 0 ? t("options.pageColumns.auto") : o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      )}

      {!vertical && readingMode === "continuous" && (
        <SmoothSlider
          label={t("reader.sideMargin")}
          value={sideMargin}
          min={SIDE_MARGIN_RANGE.min}
          max={SIDE_MARGIN_RANGE.max}
          step={SIDE_MARGIN_RANGE.step}
          format={(v) => `${v}%`}
          onCommit={setSideMargin}
        />
      )}

      <Field label={t("reader.furigana")}>
        <Select value={furiganaMode} onValueChange={guard(setFuriganaMode)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FURIGANA_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {t(`options.furigana.${m.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t("reader.font")}>
        <div className="flex items-center gap-2">
          <Select value={fontFamily} onValueChange={guard(setFontFamily)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
              {customFonts.length > 0 && (
                <SelectGroup>
                  {customFonts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={onPickFont} />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => fileRef.current?.click()} aria-label={t("reader.importFont")}>
            <Upload className="size-3.5" />
          </Button>
        </div>

        {customFonts.length > 0 && (
          <div className="mt-2 divide-y border">
            {customFonts.map((f) => (
              <div key={f.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
                <span className="min-w-0 flex-1 truncate text-xs leading-tight" title={f.label}>
                  {f.label}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeFont(f.id)}
                  aria-label={t("reader.removeFont", { name: f.label })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <SmoothSlider
        label={t("reader.fontSize")}
        value={fontSize}
        min={FONT_SIZE_RANGE.min}
        max={FONT_SIZE_RANGE.max}
        step={FONT_SIZE_RANGE.step}
        format={(v) => `${v}px`}
        onCommit={setFontSize}
      />

      <SmoothSlider
        label={t("reader.lineHeight")}
        value={lineHeight}
        min={LINE_HEIGHT_RANGE.min}
        max={LINE_HEIGHT_RANGE.max}
        step={LINE_HEIGHT_RANGE.step}
        format={(v) => v.toFixed(2)}
        onCommit={(v) => setLineHeight(Math.round(v * 20) / 20)}
      />
    </>
  );
}
