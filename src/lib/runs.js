import { supabase } from './supabase';

// -- Runs ------------------------------------------------------------------
// A "run" is an unbroken sequence of kindness acts under the grace rule:
//
//   You may always back-fill YESTERDAY if it isn't filled in yet.
//   A run ends only when TWO CONSECUTIVE DAYS pass with no act logged.
//
// In date arithmetic, between two consecutive completions on dates D1 < D2:
//
//   D2 - D1 === 1  ->  no missed days            -> same run
//   D2 - D1 === 2  ->  one missed day (grace)    -> same run
//   D2 - D1 >= 3   ->  two+ missed days in a row -> NEW run starts at D2
//
// NOTE: this is deliberately different from streak.js, which never splits
// (there, only an explicit "Restart Challenge" ends a run). runs.js is the
// Dashboard view's model. Nothing here mutates data -- it is pure derivation
// from the completions table, so no migration is required.

const GAP_ENDS_RUN = 2; // ANY missed day ends a streak (dayDiff >= 2 = a gap).
                        // A streak is only truly-consecutive days, so the
                        // "This streak" count matches what the user counts.

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(str) {
  const [y, m, d] = (str || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Whole days from a -> b (both "YYYY-MM-DD"). Positive when b is later.
function dayDiff(a, b) {
  const ms = parseLocalDate(b) - parseLocalDate(a);
  return Math.round(ms / 86400000);
}

// Calendar date for a completion row. Prefers the locked-in local_date
// column (written using the user's home timezone). Falls back to deriving
// from completed_at in device-local time so pre-local_date rows still work.
//
// NEVER use completed_at.split('T')[0] -- that is UTC and shifts the day for
// anyone logging an act late at night.
export function rowLocalDate(row) {
  if (row?.local_date) return row.local_date;
  if (row?.completed_at) return localDateStr(new Date(row.completed_at));
  return null;
}

/**
 * Split completion rows into runs.
 *
 * @param   {Array}  completions  raw rows from the completions table
 * @returns {Array}  runs, OLDEST FIRST. Each run:
 *   {
 *     rows:      [completion, ...]   // in calendar order
 *     startDate: 'YYYY-MM-DD'
 *     endDate:   'YYYY-MM-DD'
 *     length:    Number   // acts logged in this run
 *     isAlive:   Boolean  // true only for a current, still-extendable run
 *   }
 */
export function splitIntoRuns(completions, todayDate = localDateStr(new Date())) {
  if (!completions?.length) return [];

  // Dedupe rows sharing a calendar day (keep the latest write).
  const byDate = new Map();
  for (const row of completions) {
    const d = rowLocalDate(row);
    if (!d) continue;
    const prev = byDate.get(d);
    if (!prev || (row.completed_at || '') > (prev.completed_at || '')) {
      byDate.set(d, row);
    }
  }

  const rows = [...byDate.values()].sort((a, b) =>
    (rowLocalDate(a) || '').localeCompare(rowLocalDate(b) || '')
  );
  if (!rows.length) return [];

  const runs = [];
  let current = [rows[0]];

  for (let i = 1; i < rows.length; i++) {
    const prevDate = rowLocalDate(rows[i - 1]);
    const thisDate = rowLocalDate(rows[i]);
    if (dayDiff(prevDate, thisDate) >= GAP_ENDS_RUN) {
      runs.push(current);
      current = [rows[i]];
    } else {
      current.push(rows[i]);
    }
  }
  runs.push(current);

  return runs.map((r, idx) => {
    const startDate = rowLocalDate(r[0]);
    const endDate   = rowLocalDate(r[r.length - 1]);
    const isLast    = idx === runs.length - 1;

    // A run counts as the CURRENT (live) streak only when its last act was today
    // or yesterday (gap <= 1). This matches the dashboard tiles (buildPages, which
    // treats gap > 1 as an ended streak) and the streak rule: any fully-missed day
    // starts a new streak, so a run whose last act is 2+ days back has ended and
    // logging today begins a fresh one. Display-only — whether the user can still
    // log or back-fill is decided separately (canLogToday / canLogYesterday).
    const isAlive = isLast && dayDiff(endDate, todayDate) <= 1;

    return { rows: r, startDate, endDate, length: r.length, isAlive };
  });
}

/**
 * How many 30-act laps a run spans.
 *
 *   1-30 acts  -> 1 lap
 *   31-60 acts -> 2 laps
 *   61-90 acts -> 3 laps
 *
 * Note (length - 1), not length: 30 acts is a COMPLETED first lap, not the
 * start of a second one. Using length / 30 would flip to lap 2 the instant
 * act 30 landed, leaving lap 1's 30th tile unchecked. streak.js hit exactly
 * this bug with tiers -- same fix here.
 */
export function lapCount(run) {
  const n = run?.length || run?.rows?.length || 0;
  if (n <= 0) return 1;
  return Math.floor((n - 1) / 30) + 1;
}

/**
 * Turn ONE LAP of a run into a 30-slot dashboard grid.
 *
 * Slots here are ACTS, not dates: slot 1 of lap 1 is the run's first act.
 * Missed days do not consume a slot. Trailing slots are NOT_SET.
 *
 * @param run       a run from splitIntoRuns()
 * @param lapIndex  0-based lap. 0 = acts 1-30, 1 = acts 31-60, ...
 */
export function buildRunGrid(run, lapIndex = 0) {
  if (!run?.rows?.length) return [];

  const offset = lapIndex * 30;

  return Array.from({ length: 30 }, (_, i) => {
    const row = run.rows[offset + i];
    const dayNumber = offset + i + 1;

    if (!row) {
      return {
        dayNumber,
        scheduledDate: '',
        status: 'NOT_SET',
        title: '',
        proofType: null,
        completionId: null,
      };
    }
    return {
      dayNumber,
      scheduledDate: rowLocalDate(row),
      status:        'COMPLETED',
      title:         row.act_title  || '',
      proofType:     row.proof_type || null,
      completionId:  row.id || null,
    };
  });
}

/**
 * Acts logged in a given lap (1-30). Lap 2 of a 32-act run has 2.
 */
export function actsInLap(run, lapIndex) {
  const n = run?.length || 0;
  const done = n - lapIndex * 30;
  return Math.max(0, Math.min(30, done));
}

/**
 * Load every completion for a phone and return runs, oldest first.
 * Returns [] on any failure -- the caller just shows an empty dashboard.
 */
export async function loadRuns(phone) {
  if (!phone) return [];
  try {
    const { data, error } = await supabase
      .from('completions')
      .select('id, act_title, proof_type, completed_at, local_date')
      .eq('user_phone', phone)
      .order('completed_at', { ascending: true });

    if (error || !data) {
      console.warn('loadRuns error:', error?.message);
      return [];
    }
    return splitIntoRuns(data);
  } catch (e) {
    console.warn('loadRuns failed:', e.message);
    return [];
  }
}

/** Longest run the user has ever put together. */
export function bestRunLength(runs) {
  return runs.reduce((max, r) => Math.max(max, r.length), 0);
}

/** Every act ever logged, across all runs. */
export function lifetimeActs(runs) {
  return runs.reduce((sum, r) => sum + r.length, 0);
}

/**
 * Lifetime = a straight count of the user's completion rows -- every act they
 * have ever logged, regardless of streaks, gaps, or restarts. This is a direct
 * COUNT on the table (head request, no rows transferred), so it never drifts
 * from "how many acts have I done" the way the runs-based sum can (that one
 * de-dupes by date). Returns null on any failure so the caller can fall back.
 */
export async function lifetimeCompletionCount(phone) {
  if (!phone) return null;
  try {
    const { count, error } = await supabase
      .from('completions')
      .select('id', { count: 'exact', head: true })
      .eq('user_phone', phone);
    if (error) { console.warn('lifetimeCompletionCount error:', error.message); return null; }
    return count ?? 0;
  } catch (e) {
    console.warn('lifetimeCompletionCount failed:', e.message);
    return null;
  }
}