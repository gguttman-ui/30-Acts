// David's UX fix 5 (19 Nov 2026): one set of numbers on Today, Me and Tree.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
const { numbersFromRuns, show, LABELS, NUMBER_PLACEHOLDER } = require('../src/lib/myNumbers');
const { splitIntoRuns } = require('../src/lib/runs');

const rows = (dates) => dates.map((d, i) => ({ id: `r${i}`, local_date: d, completed_at: `${d}T12:00:00Z` }));
const days = (start, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});

describe('numbersFromRuns', () => {
  const today = '2026-11-19';
  test('5 days in a row ending yesterday: Day 6, streak 5', () => {
    const runs = splitIntoRuns(rows(days('2026-11-14', 5)), today);
    const n = numbersFromRuns(runs, { lifetime: 5, today });
    expect(n).toMatchObject({ dayOf: 6, streak: 5, bestStreak: 5, lifetime: 5, loggedToday: false });
  });
  test('logged today: Day = acts done, and today\'s row is found', () => {
    const runs = splitIntoRuns(rows(days('2026-11-15', 5)), today);
    const n = numbersFromRuns(runs, { lifetime: 5, today });
    expect(n).toMatchObject({ dayOf: 5, streak: 5, loggedToday: true });
    expect(n.todayRow.local_date).toBe(today);
  });
  test('after Start over the board is empty: Day 1, streak 0, but Best streak keeps the past', () => {
    const all = splitIntoRuns(rows(days('2026-11-01', 6)), today);
    const n = numbersFromRuns([], { allRuns: all, lifetime: 18, today });
    expect(n).toMatchObject({ dayOf: 1, streak: 0, bestStreak: 6, lifetime: 18 });
  });
  test('an ended run: Day 1, streak 0', () => {
    const runs = splitIntoRuns(rows(days('2026-11-01', 4)), today);
    expect(numbersFromRuns(runs, { today })).toMatchObject({ dayOf: 1, streak: 0, bestStreak: 4 });
  });
});

describe('placeholders and labels', () => {
  test('not loaded = "…", never 0', () => {
    expect(show(null)).toBe(NUMBER_PLACEHOLDER);
    expect(show(undefined)).toBe('…');
    expect(show(0)).toBe('0');
    expect(LABELS.day(null)).toBe('Day … of 30');
  });
});

describe('screens use the one counter', () => {
  const DASH = read('src', 'screens', 'DashboardView.js');
  const ME   = read('src', 'screens', 'SettingsScreen.js');
  const TREE = read('src', 'screens', 'TreeScreen.js');
  test('Today', () => {
    expect(DASH).toMatch(/const \{ dayOf, streak, todayRow \} = numbersFromRuns\(runs, \{ lifetime, today \}\);/);
  });
  test('Me: shared counter, no stand-in count, no Start-over-blind count', () => {
    expect(ME).toMatch(/loadMyNumbers\(phone, todayStr\(\)\)/);
    expect(ME).not.toMatch(/windowCompleted|streakActs/);
    expect(ME).toContain('LABELS.best');
  });
  // Fix 9 (19 Nov 2026) replaced Tree's numbers with David's wording.
  test('Tree: shared labels; placeholders, not 0', () => {
    expect(TREE).toMatch(/\[myActs, setMyActs\]\s+= useState\(null\)/);
    expect(TREE).toMatch(/\[treeActs, setTreeActs\]\s+= useState\(null\)/);
    expect(TREE).toMatch(/\[peopleUnderMe, setPeopleUnderMe\] = useState\(null\)/);
    expect(TREE).toContain('{LABELS.lifetime}');
    expect(TREE).toContain('{LABELS.invitedPeople}');
    expect(TREE).toContain('{LABELS.treeActs}');
    expect(TREE).not.toMatch(/Total\{'\\n'\}Acts/);
  });
});
