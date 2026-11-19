// myNumbers.js - David's UX fix 5 (19 Nov 2026): ONE set of numbers.
//
// Today, Me and Tree used to count in their own ways (Me showed "Day 0", then
// "Day 6", then "Day 1"; Tree's "Total Acts" mixed in the user's own acts).
// Every screen now takes its numbers from here, with the same labels:
//
//   Day X of 30   where you are in the current 30 (respects Start over)
//   Streak        days in a row right now (0 when the run has ended)
//   Best streak   longest run ever (ignores Start over - past is not erased)
//   All-time acts every act ever logged
//
// Tree adds "Acts by people you invited" and "People you invited" from the
// server (get_tree_stats). Until a number has loaded it is null, and screens
// show NUMBER_PLACEHOLDER - never 0.

import { loadRuns, lifetimeCompletionCount, bestRunLength, actsInLap, lapCount, rowLocalDate } from './runs';
import { getRestartMarker } from './restartMarker';

export const NUMBER_PLACEHOLDER = '…';
export const show = (n) => (n == null ? NUMBER_PLACEHOLDER : String(n));

export const LABELS = {
  day:       (n) => `Day ${show(n)} of 30`,
  streak:    'Streak',
  best:      'Best streak',
  lifetime:  'All-time acts',
  invitedActs:   'Acts by people you invited',
  invitedPeople: 'People you invited',
};

/**
 * The numbers from already-loaded data (pure - used by Today, which loads the
 * runs itself, and by loadMyNumbers below).
 *   runs      runs since the Start over marker (the current board)
 *   allRuns   every run ever (for Best streak); defaults to runs
 *   lifetime  straight count of completion rows
 */
export function numbersFromRuns(runs, { allRuns = runs, lifetime = null, today } = {}) {
  const currentRun = runs && runs.length ? runs[runs.length - 1] : null;
  if (!currentRun) {
    return { dayOf: 1, streak: 0, bestStreak: bestRunLength(allRuns || []), lifetime, loggedToday: false, todayRow: null };
  }
  const isLive      = !!currentRun.isAlive;
  const currentDone = actsInLap(currentRun, lapCount(currentRun) - 1);
  const todayRow    = today ? (currentRun.rows.find((r) => rowLocalDate(r) === today) || null) : null;
  const dayOf = todayRow
    ? (currentDone || 1)
    : (isLive ? (currentDone % 30) + 1 : 1);
  return {
    dayOf,
    streak: isLive ? currentRun.length : 0,
    bestStreak: bestRunLength(allRuns && allRuns.length ? allRuns : runs),
    lifetime,
    loggedToday: !!todayRow,
    todayRow,
  };
}

/** Load and work out the numbers for one person (adult phone or child key). */
export async function loadMyNumbers(phone, today) {
  if (!phone) return null;
  const since = await getRestartMarker(phone);
  const [runs, allRuns, lifetime] = await Promise.all([
    loadRuns(phone, { since }),
    since ? loadRuns(phone) : Promise.resolve(null),
    lifetimeCompletionCount(phone),
  ]);
  return numbersFromRuns(runs, { allRuns: allRuns || runs, lifetime, today });
}
