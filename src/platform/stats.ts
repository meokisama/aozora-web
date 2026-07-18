/**
 * Reading-stats store — the IndexedDB replacement for the desktop app's
 * `stats:*` IPC + the SQLite aggregation queries in `main/services/library-store`.
 *
 * Sessions are appended to `STORE_SESSIONS` (one record per completed session);
 * `getStats()` reads them all and computes the same four aggregations SQLite did,
 * in JS. Day/hour bucketing uses LOCAL calendar time to match SQLite's
 * `date(…, 'localtime')` / `strftime('%H', …, 'localtime')`.
 */

import { idbGetAll, idbPutRecord, STORE_SESSIONS } from "./db";
import { listBooks } from "./library";
import { toDayKey } from "@/lib/stats/aggregate";
import type { ReadingSession, StatsOverview, DailyActivity, HourlyActivity, PerBookStats, Stats } from "@/lib/types";

/** A stored reading session (the appended record; `id` is its own key). */
interface StoredSession extends ReadingSession {
  id: string;
}

/**
 * Records one completed reading session. Skips no-op sessions (open-and-close)
 * so they don't pollute the heatmap / counts — mirrors `main/stats.ts`.
 * Returns true if a session was stored, false if it was a no-op.
 */
export async function recordSession(session: ReadingSession): Promise<boolean> {
  const durationMs = Math.round(session?.durationMs ?? 0);
  const charsRead = Math.round(session?.charsRead ?? 0);
  if (durationMs < 1000 && charsRead <= 0) return false;
  await idbPutRecord(STORE_SESSIONS, {
    id: crypto.randomUUID(),
    bookId: session.bookId ?? null,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs,
    charsRead,
  });
  return true;
}

/** The local hour-of-day (0–23) of an epoch-ms timestamp. */
function hourOf(ms: number): number {
  return new Date(ms).getHours();
}

/**
 * All-time totals across every session. Mirrors `getStatsOverview`:
 * SUM(chars_read), SUM(duration_ms), COUNT(*), COUNT(DISTINCT local day),
 * MIN(started_at) (null when there are no sessions).
 */
function computeOverview(sessions: StoredSession[]): StatsOverview {
  let totalChars = 0;
  let totalMs = 0;
  let firstAt: number | null = null;
  const days = new Set<string>();
  for (const s of sessions) {
    totalChars += s.charsRead || 0;
    totalMs += s.durationMs || 0;
    days.add(toDayKey(new Date(s.startedAt)));
    if (firstAt === null || s.startedAt < firstAt) firstAt = s.startedAt;
  }
  return { totalChars, totalMs, sessionCount: sessions.length, activeDays: days.size, firstAt };
}

/**
 * Per-day activity, bucketed by LOCAL calendar day 'YYYY-MM-DD', oldest-first.
 * Mirrors `getDailyActivity`: SUM(chars), SUM(ms), COUNT(*), COUNT(DISTINCT
 * book_id) — where COUNT(DISTINCT) ignores NULL book ids, as in SQLite.
 */
function computeDaily(sessions: StoredSession[]): DailyActivity[] {
  const map = new Map<string, { chars: number; ms: number; sessions: number; books: Set<string> }>();
  for (const s of sessions) {
    const day = toDayKey(new Date(s.startedAt));
    let bucket = map.get(day);
    if (!bucket) {
      bucket = { chars: 0, ms: 0, sessions: 0, books: new Set() };
      map.set(day, bucket);
    }
    bucket.chars += s.charsRead || 0;
    bucket.ms += s.durationMs || 0;
    bucket.sessions += 1;
    if (s.bookId != null) bucket.books.add(s.bookId);
  }
  return [...map.entries()]
    .map(([day, b]) => ({ day, chars: b.chars, ms: b.ms, sessions: b.sessions, books: b.books.size }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/**
 * Activity grouped by LOCAL hour-of-day (0–23), ordered by hour. Mirrors
 * `getHourlyActivity`: only hours that actually occur are returned (the view
 * fills the 24 buckets itself).
 */
function computeHourly(sessions: StoredSession[]): HourlyActivity[] {
  const map = new Map<number, { chars: number; ms: number }>();
  for (const s of sessions) {
    const hour = hourOf(s.startedAt);
    let bucket = map.get(hour);
    if (!bucket) {
      bucket = { chars: 0, ms: 0 };
      map.set(hour, bucket);
    }
    bucket.chars += s.charsRead || 0;
    bucket.ms += s.durationMs || 0;
  }
  return [...map.entries()].map(([hour, b]) => ({ hour, chars: b.chars, ms: b.ms })).sort((a, b) => a.hour - b.hour);
}

/**
 * Per-book totals for sessions with a non-null book id, joined to the current
 * library title/author, ordered by time read desc. Mirrors `getPerBookStats` +
 * the view's join: books no longer in the library are dropped (the desktop's
 * LEFT JOIN kept them null, but the view only renders matched books), so we keep
 * only groups whose book still exists.
 */
async function computePerBook(sessions: StoredSession[]): Promise<PerBookStats[]> {
  const map = new Map<string, { chars: number; ms: number; sessions: number; lastAt: number }>();
  for (const s of sessions) {
    if (s.bookId == null) continue;
    let bucket = map.get(s.bookId);
    if (!bucket) {
      bucket = { chars: 0, ms: 0, sessions: 0, lastAt: 0 };
      map.set(s.bookId, bucket);
    }
    bucket.chars += s.charsRead || 0;
    bucket.ms += s.durationMs || 0;
    bucket.sessions += 1;
    if (s.endedAt > bucket.lastAt) bucket.lastAt = s.endedAt;
  }

  const books = await listBooks();
  const byId = new Map(books.map((b) => [b.id, b]));

  const result: PerBookStats[] = [];
  for (const [bookId, b] of map) {
    const book = byId.get(bookId);
    if (!book) continue; // book removed from the library — drop it
    result.push({ bookId, title: book.title, author: book.author, chars: b.chars, ms: b.ms, sessions: b.sessions, lastAt: b.lastAt });
  }
  return result.sort((a, b) => b.ms - a.ms);
}

/**
 * One round-trip returning everything the stats page needs: overview totals,
 * per-day / per-hour activity, and per-book totals. Reads every session and
 * computes the aggregations in JS (SQLite did this in the desktop app).
 */
export async function getStats(): Promise<Stats> {
  const sessions = await idbGetAll<StoredSession>(STORE_SESSIONS);
  return {
    overview: computeOverview(sessions),
    daily: computeDaily(sessions),
    hourly: computeHourly(sessions),
    perBook: await computePerBook(sessions),
  };
}
