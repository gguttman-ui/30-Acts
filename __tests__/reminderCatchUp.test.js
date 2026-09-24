// Backlog item 61, 24 Sep 2026.
//
// Measured on staging: one send-reminders run reaches about 350 due people
// before the 150-second platform limit stops it (500 due -> 358 sent, 142
// silently missed). The fix is a catch-up window plus once-per-run lookups, and
// paging every bulk load past PostgREST's 1,000-row cap. Source-level, like
// reminderPolicy.test.js.

const fs   = require('fs');
const path = require('path');

const FN = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'send-reminders', 'index.ts'), 'utf8');

function slice(head) {
  const i = FN.indexOf(head);
  expect(i).toBeGreaterThan(-1);
  return FN.slice(i, FN.indexOf('\n}', i) + 2);
}

describe('catch-up window (item 61)', () => {
  test('a reminder stays due for 30 minutes after its time', () => {
    expect(FN).toMatch(/const CATCHUP_MIN = 30;/);
    const fn = slice('function matchesSlot');
    expect(fn).toMatch(/late >= -WINDOW_MIN && late <= CATCHUP_MIN/);
    expect(fn).not.toMatch(/Math\.abs/);
  });

  // The window logic itself, mirrored here so its edges are pinned.
  const due = (nowMin, target) => { const late = nowMin - target; return late >= -2 && late <= 30; };
  test.each([
    [9 * 60 - 3, false], [9 * 60 - 2, true], [9 * 60, true],
    [9 * 60 + 5, true], [9 * 60 + 30, true], [9 * 60 + 31, false],
  ])('9:00 reminder, now = %i minutes -> due %s', (now, expected) => {
    expect(due(now, 9 * 60)).toBe(expected);
  });
});

describe('once-per-run lookups (item 61)', () => {
  test('sent and completed are loaded once per run', () => {
    expect(FN).toMatch(/sentCache\s*=\s*await loadRecentSends\(recentSince\)/);
    expect(FN).toMatch(/completedCache\s*=\s*await loadRecentCompletions\(recentSince\)/);
  });

  test('the per-person checks use the loaded sets when available', () => {
    expect(slice('async function alreadySent')).toMatch(/if \(sentCache\) return sentCache\.has/);
    expect(slice('async function alreadyCompletedToday')).toMatch(/if \(completedCache\) return completedCache\.has/);
  });

  test('recording a send updates the set, so one run never sends twice', () => {
    expect(slice('async function recordSend')).toMatch(/sentCache\?\.add\(sentKey\(userId, dateStr, slot\)\)/);
  });
});

describe('bulk loads page past the 1,000-row cap (item 61)', () => {
  test('fetchAllRows pages with range and stops on a short page', () => {
    const fn = slice('async function fetchAllRows');
    expect(fn).toMatch(/const size = 1000;/);
    expect(fn).toMatch(/data\.length < size/);
  });

  test.each(['loadOptOuts', 'loadActivePhones', 'loadRecentSends', 'loadRecentCompletions'])(
    '%s uses fetchAllRows with a stable order', (name) => {
      const fn = slice(`async function ${name}`);
      expect(fn).toMatch(/fetchAllRows\(/);
      expect(fn).toMatch(/\.order\(/);
      expect(fn).toMatch(/\.range\(from, to\)/);
    });

  test('a failed activity load still disables the inactivity check', () => {
    expect(slice('async function loadActivePhones')).toMatch(/if \(data === null\) return null;/);
  });
});
