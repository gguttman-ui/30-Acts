// Dashboard paging: turn a user's completion history into swipe pages.
//
// Extracted from DashboardView so it can be unit-tested. Pure -- no React, no
// network, no device APIs. The screen imports buildPages from here.
//
// THE RULE (decided August 2026): a streak ENDS at day 30. Day 31 does not
// continue it; it begins a new streak numbered from day 1. There is no such
// thing as "lap 2".

// Calendar date for a completion row. Mirrors runs.js's rowLocalDate, inlined
// so this module stays free of the supabase import and can be tested directly.
function rowLocalDate(row) {
  if (row?.local_date) return row.local_date;
  if (row?.completed_at) {
    const d = new Date(row.completed_at);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  return null;
}

export const CHALLENGE_LEN  = 30;
export const TILES_PER_PAGE = 30;

// Whole days from a -> b (both "YYYY-MM-DD"). Positive when b is later.
export function dayDiffDays(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

export function fmtMonthDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr.slice(8, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Turn the completion history into swipe pages.
//
// The history is cut into "pieces". A single missed day is NEVER a page break --
// it shows as a blank tile inside the streak, and numbering stays continuous
// (day 1, 2, 3 ...). A piece only ends at:
//   - a break of 2+ missed days in a row (a real streak break), OR
//   - the edge of a 30-days-in-a-row completed challenge (carved out).
//
// Each piece is then:
//   - a "challenge" (30+ consecutive days) -> its own "Completed" page, or
//   - a "fragment" (an ordinary streak, single misses shown as blanks) ->
//     the interactive current page if it's the latest piece, otherwise packed
//     together with other short fragments (30 tiles per page).
// Chronological order: oldest left, current right.
export function buildPages(runs, { today = '', hasLoggableDay = false } = {}) {
  // Every completion row, de-duped by calendar date, oldest first.
  const byDate = new Map();
  runs.forEach((run) => (run.rows || []).forEach((r) => {
    const d = rowLocalDate(r);
    if (d && !byDate.has(d)) byDate.set(d, r);
  }));
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];

  // Which dates belong to a 30+ consecutive-day block (a completed challenge)?
  const challengeDates = new Set();
  {
    let s = 0;
    for (let i = 1; i <= dates.length; i++) {
      if (i === dates.length || dayDiffDays(dates[i - 1], dates[i]) !== 1) {
        if (i - s >= CHALLENGE_LEN) {
          // Only WHOLE 30-day challenges count. A 38-day block is one completed
          // challenge (30) plus an 8-day remainder; the remainder is an ordinary
          // short streak and packs onto the shared page with the others.
          const whole = Math.floor((i - s) / CHALLENGE_LEN) * CHALLENGE_LEN;
          for (let k = s; k < s + whole; k++) challengeDates.add(dates[k]);
        }
        s = i;
      }
    }
  }

  // Cut the history into pieces: a challenge block, or a fragment (ordinary
  // streak that tolerates single-day gaps but breaks at 2+ missed days).
  const pieces = [];
  let i = 0;
  while (i < dates.length) {
    if (challengeDates.has(dates[i])) {
      let j = i + 1;
      while (j < dates.length && challengeDates.has(dates[j]) && dayDiffDays(dates[j - 1], dates[j]) === 1 && (j - i) < CHALLENGE_LEN) j++;
      pieces.push({ kind: 'challenge', dates: dates.slice(i, j) });
      i = j;
    } else {
      let j = i + 1;
      // A streak is now ONLY truly-consecutive days: ANY gap (a single missed,
      // un-backfilled day) ends the streak, so the next completion starts a
      // fresh streak numbered from Day 1.
      while (j < dates.length && !challengeDates.has(dates[j]) && dayDiffDays(dates[j - 1], dates[j]) === 1) j++;
      pieces.push({ kind: 'fragment', dates: dates.slice(i, j) });
      i = j;
    }
  }

  // Fragment -> cells, with a blank tile for each internal missed day and
  // continuous numbering across those blanks.
  const fragmentCells = (ds, interactive) => {
    const cells = [];
    let actNo = 0;
    for (let k = 0; k < ds.length; k++) {
      if (k > 0) {
        const diff = dayDiffDays(ds[k - 1], ds[k]);
        for (let g = 1; g < diff; g++) cells.push({ type: 'gap' });
      }
      actNo++;
      cells.push({ type: 'act', date: ds[k], actNo, row: byDate.get(ds[k]), interactive });
    }
    return cells;
  };

  // Pad the current streak's cells out to a full 30-slot board so the current
  // page always shows the whole 30-day journey: logged days fill from the
  // top-left, the "+" sits on today's slot, and every remaining slot is an
  // empty placeholder that still shows its day number and projected date.
  const padBoard = (cells, startDayNo = 1) => {
    const out = cells.slice(0, CHALLENGE_LEN);
    for (let i = out.length; i < CHALLENGE_LEN; i++) {
      out.push({ type: 'future', dayNo: startDayNo + i, date: null });
    }
    return out;
  };

  // A lap page is always a full 30-slot board. A lap that only got partway --
  // e.g. a 32-day streak whose second lap holds just days 31 and 32 -- fills
  // slots 1 and 2 and leaves the other 28 as faint placeholders carrying their
  // day number and no date (those days never happened, so a projected date
  // would be a lie). This is what makes day 31 read as the start of a new
  // 30-day board instead of a lone tile hanging off the previous grid.
  const padPast = (cells, startDayNo = 1) => {
    const out = cells.slice(0, CHALLENGE_LEN);
    for (let i = out.length; i < CHALLENGE_LEN; i++) {
      out.push({ type: 'future', dayNo: startDayNo + i, date: null });
    }
    return out;
  };

  const rangeLabel = (a, b) => (a === b ? fmtMonthDay(a) : `${fmtMonthDay(a)}${'–'}${fmtMonthDay(b)}`);

  const lastIdx = pieces.length - 1;
  const pages = [];
  let buffer = null;
  const flush = () => { if (buffer && buffer.cells.length) pages.push(buffer); buffer = null; };

  // Short, never-completed streaks share a page, oldest first, one blank tile
  // between them -- six little May/June streaks belong together on one page,
  // not spread over six near-empty ones. A piece stays whole when it fits, and
  // only a piece too big for one page wraps.
  const packInto = (cells) => {
    const sep = (buffer && buffer.cells.length) ? 1 : 0;
    if (buffer && buffer.cells.length && buffer.cells.length + sep + cells.length > TILES_PER_PAGE) flush();
    if (!buffer) buffer = { type: 'consolidated', cells: [] };
    if (buffer.cells.length) buffer.cells.push({ type: 'sep' });
    for (const c of cells) {
      if (buffer.cells.length >= TILES_PER_PAGE) { flush(); buffer = { type: 'consolidated', cells: [] }; }
      buffer.cells.push(c);
    }
  };

  let currentPlaced = false;
  pieces.forEach((pc, pi) => {
    const isCurrent = pi === lastIdx;

    if (pc.kind === 'challenge') {
      // Earlier short streaks come first chronologically, so close their shared
      // page before this completed streak claims one of its own.
      flush();
      // A challenge piece is capped at 30 days, so this is always exactly one
      // page. Day 31 is NOT a continuation: it fell out of the challenge block
      // above and arrives here as an ordinary short streak, numbered from 1.
      const ds      = pc.dates;
      const numLaps = Math.ceil(ds.length / CHALLENGE_LEN);
      for (let lap = 0; lap < numLaps; lap++) {
        const slice      = ds.slice(lap * CHALLENGE_LEN, (lap + 1) * CHALLENGE_LEN);
        const startDayNo = lap * CHALLENGE_LEN + 1;
        const isLastLap  = lap === numLaps - 1;
        const isFull     = slice.length === CHALLENGE_LEN;
        const cells      = slice.map((d, k) => ({
          type: 'act', date: d, actNo: startDayNo + k, row: byDate.get(d),
        }));

        // The trailing partial lap is only TODAY's board if the streak is still
        // alive (last act was today or yesterday). A 32-day streak that died in
        // July must render its lap 2 as a past page, not as a live board with a
        // "+" on it.
        const stillAlive = dayDiffDays(ds[ds.length - 1], today) <= 1;

        if (isCurrent && isLastLap && !isFull && stillAlive) {
          // In-progress lap (e.g. day 31): its own fresh 30-day board — logged
          // days, the "+" for today if still open, then future placeholders.
          const live = cells.map((c) => ({ ...c, interactive: true }));
          if (hasLoggableDay) live.push({ type: 'next', interactive: true });
          pages.push({ type: 'current', cells: padBoard(live, startDayNo), hasCurrent: true });
          currentPlaced = true;
        } else {
          pages.push({
            type:  'streak',
            cells: padPast(cells, startDayNo),
            label: lap === 0
              ? `STREAK ${'·'} Completed ${'·'} ${rangeLabel(slice[0], slice[slice.length - 1])}`
              : `STREAK ${'·'} LAP ${lap + 1} ${'·'} ${rangeLabel(slice[0], slice[slice.length - 1])}`,
          });
        }
      }
      return;
    }

    // fragment
    if (isCurrent) {
      const lastDate   = pc.dates[pc.dates.length - 1];
      const gapToToday = dayDiffDays(lastDate, today);
      if (gapToToday <= 1) {
        // Streak still alive — the last logged day is today (0) or yesterday (1),
        // so today continues THIS streak with no gap. It owns the 30-slot board.
        const cells = fragmentCells(pc.dates, true);
        if (hasLoggableDay) {
          cells.push({ type: 'next', interactive: true });
        }
        flush();
        pages.push({ type: 'current', cells: padBoard(cells), hasCurrent: true });
      } else {
        // The last streak ENDED (yesterday was missed) — it joins the earlier
        // short streaks, and today starts a brand-new board as Day 1.
        packInto(fragmentCells(pc.dates, false));
        flush();
        if (hasLoggableDay) {
          pages.push({ type: 'current', cells: padBoard([{ type: 'next', interactive: true }]), hasCurrent: true });
        }
      }
      currentPlaced = true;
    } else {
      packInto(fragmentCells(pc.dates, false));
    }
  });
  flush();

  // Edge case: the latest piece was a 30+ challenge (a live long streak) and
  // today is still open -> give a small current page to log today.
  if (hasLoggableDay && !currentPlaced) {
    // Fresh board after a completed 30-day challenge: today is day 1.
    const cells = [{ type: 'next', interactive: true }];
    pages.push({ type: 'current', cells: padBoard(cells), hasCurrent: true });
  }

  pages.forEach((p, idx) => { p.id = idx; });
  return pages;
}
