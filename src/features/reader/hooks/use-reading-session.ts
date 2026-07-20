import { useCallback, useEffect, useRef } from "react";
import {
  type SessionAccumulator,
  type PaginatedAccumulator,
  createAccumulator,
  createPaginatedAccumulator,
  advance,
  advancePaginated,
} from "@/lib/stats/session-tracker";
import { recordSession } from "@/platform/stats";

/**
 * Char accounting per mode: `continuous` sampled per tick (`advance`),
 * `paginated` credited per flip (`advancePaginated`), `fixed` (manga) time-only.
 */
export type SessionMode = "continuous" | "paginated" | "fixed";

/**
 * Tracks reading sessions for the stats page. Time accrues on a 1s tick, only
 * while active (visible + input within IDLE_MS); idle/hidden ticks count no time
 * and leave the char baseline untouched so reading resumes cleanly. State machine
 * and crediting rules live in lib/stats/session-tracker.
 */

interface Session {
  active: boolean;
  bookId: string | null;
  mode: SessionMode;
  startedAt: number;
  lastTickAt: number;
  lastActivityAt: number;
  activeMs: number;
  currentPos: number;
  acc: SessionAccumulator;
  /** paginated only: span accounting credited on each flip */
  pacc: PaginatedAccumulator;
  /** paginated only: `activeMs` when current page entered; flip dwell = activeMs − this */
  pageEnteredActiveMs: number;
}

const IDLE_SESSION: Session = {
  active: false,
  bookId: null,
  mode: "continuous",
  startedAt: 0,
  lastTickAt: 0,
  lastActivityAt: 0,
  activeMs: 0,
  currentPos: 0,
  acc: createAccumulator(0),
  pacc: createPaginatedAccumulator(0),
  pageEnteredActiveMs: 0,
};

const TICK_MS = 1000;
const IDLE_MS = 180_000; // no input this long ⇒ stop counting (AFK)
const MAX_TICK_MS = 5 * TICK_MS; // cap one tick's time (guards timer stalls)

export function useReadingSession(bookId?: string | null) {
  const ref = useRef<Session>({ ...IDLE_SESSION });

  const begin = (pos: number, mode: SessionMode, now: number) => {
    ref.current = {
      active: true,
      bookId: bookId ?? null,
      mode,
      startedAt: now,
      lastTickAt: now,
      lastActivityAt: now,
      activeMs: 0,
      currentPos: pos,
      acc: createAccumulator(pos),
      pacc: createPaginatedAccumulator(pos),
      pageEnteredActiveMs: 0,
    };
  };

  // Chars read from whichever accumulator the mode uses.
  const charsReadOf = (s: Session) => (s.mode === "paginated" ? s.pacc.charsAccum : s.mode === "continuous" ? s.acc.charsAccum : 0);

  const flush = useCallback(() => {
    const s = ref.current;
    if (!s.active) return;
    s.active = false;
    const charsRead = charsReadOf(s);
    if (s.activeMs < 1000 && charsRead <= 0) return;
    recordSession({
      bookId: s.bookId ?? null,
      startedAt: s.startedAt,
      endedAt: s.lastActivityAt,
      durationMs: s.activeMs,
      charsRead,
    }).catch(() => {});
  }, []);

  // Position/activity feed from the reader. Paginated: a position change is a flip,
  // so the finished page's span is credited here (event-driven); continuous defers
  // to the tick.
  const mark = useCallback(
    (pos: number, mode: SessionMode = "continuous") => {
      if (!bookId) return;
      const s = ref.current;
      const now = Date.now();
      if (!s.active) {
        begin(pos, mode, now);
        return;
      }
      if (s.mode === "paginated" && pos !== s.currentPos) {
        // Flip: credit the page just left, gated on active dwell time.
        s.pacc = advancePaginated(s.pacc, pos, s.activeMs - s.pageEnteredActiveMs);
        s.pageEnteredActiveMs = s.activeMs;
      }
      s.currentPos = pos;
      s.lastActivityAt = now;
    },
    [bookId],
  );

  // 1s sampler: the only place time and chars are accrued.
  const tick = useCallback(() => {
    const s = ref.current;
    if (!s.active) return;
    const now = Date.now();
    const elapsed = now - s.lastTickAt;
    s.lastTickAt = now;

    // Skip hidden/idle ticks; leave the position baseline so reading resumes cleanly.
    if (document.hidden || now - s.lastActivityAt > IDLE_MS) return;

    s.activeMs += Math.min(elapsed, MAX_TICK_MS);

    // Continuous is sampled here; paginated is credited per flip; fixed counts no chars.
    if (s.mode === "continuous") s.acc = advance(s.acc, s.currentPos);
  }, []);

  useEffect(() => {
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick]);

  // Count mouse/keyboard/wheel as activity too, so dwelling on a static paginated
  // page (position unchanged until you flip) doesn't trip the idle cutoff.
  useEffect(() => {
    const onActivity = () => {
      if (ref.current.active) ref.current.lastActivityAt = Date.now();
    };
    window.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("wheel", onActivity, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("wheel", onActivity);
    };
  }, []);

  // Flush on book change / unmount (closing session's id was captured at begin).
  useEffect(() => flush, [bookId, flush]);

  // Flush on window close so exit doesn't lose the open session.
  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [flush]);

  return { mark, flush };
}
