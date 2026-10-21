// dayNumbers.js -- the stored day_number for every completion.
//
// RULE (Gary, 20 Oct 2026, backlog 83): a day number is the act's position in
// its STREAK -- consecutive calendar days, restarting at 1 after any missed
// day. Bridget, 11-20 Oct with 10 Oct missed, is on day 10, not day 33.
//
// Why this is computed from the dates and not taken from the screen: the
// dashboard's "+" tile always passed dayNumber 1, so an act logged before
// yesterday was back-filled was stored as Day 1 (Bridget six times, David
// six times). Back-filling yesterday afterwards also has to renumber TODAY,
// which the screen never knew about. Working the numbers out from the full
// list of dates after every save fixes both.
//
// Pure: no React Native, no Supabase, so __tests__/dayNumbers.test.js can run
// it directly.

function parseYMD(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Whole days from a to b ("YYYY-MM-DD"). Positive when b is later. */
export function daysBetween(a, b) {
  return Math.round((parseYMD(b) - parseYMD(a)) / 86400000);
}

/**
 * Map every date to its position in its streak.
 *
 * @param  {string[]} dates  "YYYY-MM-DD", any order, duplicates allowed
 * @return {Map<string, number>}
 */
export function streakDayNumbers(dates) {
  const unique = [...new Set((dates || []).filter(Boolean))].sort();
  const out = new Map();
  let prev = null;
  let n = 0;
  for (const d of unique) {
    n = prev && daysBetween(prev, d) === 1 ? n + 1 : 1;
    out.set(d, n);
    prev = d;
  }
  return out;
}

/**
 * The rows whose stored day_number is wrong, with the number each should have.
 *
 * @param  {{id:any, local_date:string, day_number:number}[]} rows
 * @return {{id:any, day_number:number}[]}
 */
export function dayNumberFixes(rows) {
  const numbers = streakDayNumbers((rows || []).map((r) => r && r.local_date));
  const fixes = [];
  for (const r of rows || []) {
    if (!r || !r.local_date || r.id == null) continue;
    const want = numbers.get(r.local_date);
    if (want != null && r.day_number !== want) fixes.push({ id: r.id, day_number: want });
  }
  return fixes;
}
