/**
 * Small presentation helpers shared by the library views.
 */

export type ReadingStatus = "unread" | "reading" | "finished";

/**
 * Derives a reading status from a book's progress. There is no separate status
 * column — `progress` (0..1) is the single source of truth: 0 = untouched,
 * (near-)1 = read through, anything between = in progress.
 */
export function readingStatus(book: { progress?: number } | null | undefined): ReadingStatus {
  const p = book?.progress ?? 0;
  if (p <= 0) return "unread";
  if (p >= 0.99) return "finished";
  return "reading";
}

/** Minimal shape of i18next's `t` — avoids a hard dependency on its types here. */
type TFunc = (key: string, options?: Record<string, unknown>) => string;

/**
 * A compact, human relative time ("just now", "3d ago"), localised via the
 * passed `t`. Null for falsy ts. Callers get `t` from `useTranslation()` so the
 * label re-renders on a language change.
 */
export function relativeTime(ts: number | null | undefined, t: TFunc): string | null {
  if (!ts) return null;
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return t("time.justNow");
  const min = Math.round(sec / 60);
  if (min < 60) return t("time.minutesAgo", { count: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t("time.hoursAgo", { count: hr });
  const day = Math.round(hr / 24);
  if (day < 7) return t("time.daysAgo", { count: day });
  const wk = Math.round(day / 7);
  if (wk < 5) return t("time.weeksAgo", { count: wk });
  const mo = Math.round(day / 30);
  if (mo < 12) return t("time.monthsAgo", { count: mo });
  return t("time.yearsAgo", { count: Math.round(day / 365) });
}
