/**
 * Reading-vs-scrolling accounting — layout-independent core of the 1s sampler in
 * use-reading-session.ts. Two-state machine with hysteresis, sampled per active
 * second (idle/hidden ticks never reach `advance`):
 *
 *   READING   — credit net forward move, capped at READ_CAP/tick so a flick can't
 *               inflate. Backward subtracts (telescoping) so re-reads don't
 *               double-count.
 *   SCROLLING — entered on SCROLL_ENTER or a JUMP teleport. Credits nothing;
 *               baseline resyncs each tick so scrolled distance is never credited
 *               retroactively. Resumes READING only after speed stays below SETTLE
 *               for SETTLE_TICKS consecutive seconds.
 *
 * Fixed-layout (manga) positions are page ordinals, so those sessions skip this
 * (charsRead stays 0).
 */

export type ReadState = "reading" | "scrolling";

export interface SessionAccumulator {
  state: ReadState;
  charsAccum: number;
  lastPos: number;
  /** consecutive settled (slow) ticks while SCROLLING, toward resuming READING */
  settleStreak: number;
}

export interface TrackerConfig {
  /** per-tick |Δ| ≥ this ⇒ navigation teleport (TOC/search/fast multi-flip) */
  jumpThreshold: number;
  /** in READING, speed > this ⇒ this is scrolling, switch state, credit 0 */
  scrollEnter: number;
  /** in SCROLLING, speed ≤ this counts as a settled (paused-to-read) tick */
  settleSpeed: number;
  /** consecutive settled ticks required to resume READING (dwell-to-resume) */
  settleTicks: number;
  /** max chars credited in a single READING tick (human reading-speed ceiling) */
  readCap: number;
}

/**
 * Tuned for Japanese prose (chars ≈ position units). Fast JP ~10–12 chars/s, so
 * READ_CAP=50 never clips reading while SCROLL_ENTER=150 (9000/min) flags
 * scrolling. SETTLE=60 ≥ READ_CAP so reading counts as settled and can resume.
 */
export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  jumpThreshold: 2700,
  scrollEnter: 150,
  settleSpeed: 60,
  settleTicks: 2,
  readCap: 50,
};

/** Fresh accumulator anchored at the position where the session began. */
export function createAccumulator(pos: number): SessionAccumulator {
  return { state: "reading", charsAccum: 0, lastPos: pos, settleStreak: 0 };
}

/** Advances the accumulator one active tick to absolute position `pos`. Pure; call once per active second. */
export function advance(acc: SessionAccumulator, pos: number, config: TrackerConfig = DEFAULT_TRACKER_CONFIG): SessionAccumulator {
  const delta = pos - acc.lastPos;
  const speed = Math.abs(delta);
  let state = acc.state;
  let settleStreak = acc.settleStreak;
  let credited = 0;

  if (speed >= config.jumpThreshold) {
    // Teleport (TOC/search/bookmark) — force scrolling, credit nothing.
    state = "scrolling";
    settleStreak = 0;
  } else if (state === "scrolling") {
    // Mid-scroll: credit nothing; resume reading after SETTLE_TICKS slow seconds.
    if (speed <= config.settleSpeed) {
      settleStreak += 1;
      if (settleStreak >= config.settleTicks) {
        state = "reading";
        settleStreak = 0;
      }
    } else {
      settleStreak = 0;
    }
  } else {
    // READING.
    if (speed > config.scrollEnter) {
      state = "scrolling"; // fast flick — switch, credit nothing
      settleStreak = 0;
    } else {
      // Telescope (backward subtracts) but cap forward so a flick can't inflate.
      credited = delta > 0 ? Math.min(delta, config.readCap) : delta;
    }
  }

  return {
    state,
    charsAccum: Math.max(0, acc.charsAccum + credited),
    lastPos: pos, // always resync ⇒ scrolled distance never credited later
    settleStreak,
  };
}

/**
 * Paginated-mode accounting. EVENT-driven, not per-second: position is static on a
 * page then jumps a whole span on flip, which the sampler can't credit. So credit
 * on the flip — the finished page's span, gated on dwell (skim guard) and only for
 * a forward non-teleport move. `dwellMs` is active time on the page just left.
 */
export interface PaginatedAccumulator {
  charsAccum: number;
  lastPos: number;
}

export interface PaginatedConfig {
  /** |Δ| ≥ this ⇒ navigation teleport (TOC/search/bookmark) — resync, credit 0 */
  jumpThreshold: number;
  /** must dwell at least this many active ms on a page before its span counts */
  minDwellMs: number;
}

/** Shares `jumpThreshold` with the continuous tracker; ~3s dwell gates skimming. */
export const DEFAULT_PAGINATED_CONFIG: PaginatedConfig = {
  jumpThreshold: DEFAULT_TRACKER_CONFIG.jumpThreshold,
  minDwellMs: 3000,
};

/** Fresh paginated accumulator anchored at the page the session began on. */
export function createPaginatedAccumulator(pos: number): PaginatedAccumulator {
  return { charsAccum: 0, lastPos: pos };
}

/** Advances on a flip to absolute char offset `pos` (start of the new page). Pure; call once per flip. */
export function advancePaginated(
  acc: PaginatedAccumulator,
  pos: number,
  dwellMs: number,
  config: PaginatedConfig = DEFAULT_PAGINATED_CONFIG,
): PaginatedAccumulator {
  const delta = pos - acc.lastPos;
  // Credit only a forward, non-teleport, sufficiently-dwelled flip. Others credit
  // nothing but still resync, so skipped spans aren't credited later.
  const credited = delta > 0 && delta < config.jumpThreshold && dwellMs >= config.minDwellMs ? delta : 0;
  return {
    charsAccum: acc.charsAccum + credited,
    lastPos: pos,
  };
}
