// streak.js imports the supabase client (which pulls native storage on import).
// We only test the PURE functions here, so stub the client out entirely.
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import {
  extractPhone,
  rowLocalDate,
  findMostRecentStreak,
  buildGridFromStreak,
  windowStartDate,
  currentWindowIndex,
  deletionBreaksStreak,
} from '../src/lib/streak';

// Local "YYYY-MM-DD" for a given offset from today (matches the app's local-date logic).
function localDayOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('extractPhone', () => {
  test('strips the proxy-email suffix', () => {
    expect(extractPhone('+15550100142@phone.30acts.app')).toBe('+15550100142');
  });
  test('returns null for real emails and bad input', () => {
    expect(extractPhone('someone@gmail.com')).toBeNull();
    expect(extractPhone(null)).toBeNull();
    expect(extractPhone(123)).toBeNull();
  });
});

describe('rowLocalDate', () => {
  test('prefers the locked-in local_date column', () => {
    expect(rowLocalDate({ local_date: '2026-05-01', completed_at: '2026-05-02T00:00:00Z' })).toBe('2026-05-01');
  });
  test('falls back to completed_at (returns a YYYY-MM-DD string)', () => {
    expect(rowLocalDate({ completed_at: '2026-05-01T12:00:00Z' })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('returns null when neither field is present', () => {
    expect(rowLocalDate({})).toBeNull();
  });
});

describe('findMostRecentStreak', () => {
  test('empty / null input returns an empty array', () => {
    expect(findMostRecentStreak([])).toEqual([]);
    expect(findMostRecentStreak(null)).toEqual([]);
  });
  test('dedupes same-day rows (keeps the latest completed_at) and sorts by date', () => {
    const rows = [
      { local_date: '2026-05-01', completed_at: '2026-05-01T08:00:00Z', id: 'a' },
      { local_date: '2026-05-01', completed_at: '2026-05-01T20:00:00Z', id: 'b' }, // later, wins
      { local_date: '2026-05-02', completed_at: '2026-05-02T09:00:00Z', id: 'c' },
    ];
    const s = findMostRecentStreak(rows);
    expect(s).toHaveLength(2);
    expect(s[0].id).toBe('b');
    expect(s[1].id).toBe('c');
  });
});

describe('buildGridFromStreak', () => {
  test('null / empty streak returns null', () => {
    expect(buildGridFromStreak(null)).toBeNull();
    expect(buildGridFromStreak([])).toBeNull();
  });
  test('anchored on today: 30-day grid, Day 1 completed, rest open', () => {
    const grid = buildGridFromStreak([{ local_date: localDayOffset(0), act_title: 'Test act', id: 'x' }]);
    expect(grid).toHaveLength(30);
    expect(grid[0].dayNumber).toBe(1);
    expect(grid[0].status).toBe('COMPLETED');
    expect(grid[0].title).toBe('Test act');
    expect(grid[1].status).toBe('NOT_SET');
    expect(grid[29].dayNumber).toBe(30);
  });
});

describe('windowStartDate', () => {
  test('window 0 is the anchor; each window is +30 calendar days', () => {
    expect(windowStartDate('2026-01-01', 0)).toBe('2026-01-01');
    expect(windowStartDate('2026-01-01', 1)).toBe('2026-01-31');
  });
});

describe('currentWindowIndex', () => {
  test('advances every 30 calendar days from the anchor', () => {
    expect(currentWindowIndex('2026-01-01', '2026-01-01')).toBe(0);
    expect(currentWindowIndex('2026-01-01', '2026-01-30')).toBe(0); // 29 days
    expect(currentWindowIndex('2026-01-01', '2026-01-31')).toBe(1); // 30 days
    expect(currentWindowIndex('2026-01-01', '2026-03-02')).toBe(2); // ~60 days
  });
});

describe('deletionBreaksStreak', () => {
  const days = [
    { dayNumber: 1, status: 'COMPLETED' },
    { dayNumber: 2, status: 'COMPLETED' },
    { dayNumber: 3, status: 'COMPLETED' },
  ];
  test('deleting a middle completed day breaks the streak', () => {
    expect(deletionBreaksStreak(days, 2)).toBe(true);
  });
  test('deleting the first or last completed day does not', () => {
    expect(deletionBreaksStreak(days, 1)).toBe(false);
    expect(deletionBreaksStreak(days, 3)).toBe(false);
  });
  test('null days is safe', () => {
    expect(deletionBreaksStreak(null, 2)).toBe(false);
  });
});
