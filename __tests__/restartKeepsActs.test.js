// "Start over at Day 1" must never hide past acts (Gary, 22 Nov 2026).
//
// THE BUG: Ghenno restarted on 20 Sep 2026 at 16:56 UTC. The dashboard then
// loaded only acts SAVED after that moment, so Sep 15-19 vanished from his
// calendar (21 tiles) while the Tree still counted all 26.
//
// THE RULE NOW: every act stays on the board. The restart only BREAKS the
// streak: acts saved before it close the old streak, acts saved after it start
// a new one at Day 1 - even when the calendar days are back to back.

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

const { splitIntoRuns } = require('../src/lib/runs');
const { buildPages } = require('../src/lib/dashboardPages');
const { numbersFromRuns } = require('../src/lib/myNumbers');

const act = (local_date, completed_at) => ({ id: local_date, local_date, completed_at, act_title: 'x' });

// Ghenno's real Sep 15-20 rows and his real marker.
const GHENNO = [
  act('2026-09-15', '2026-09-16T03:18:37.734Z'),
  act('2026-09-16', '2026-09-16T15:11:39.765Z'),
  act('2026-09-17', '2026-09-17T23:34:44.342Z'),
  act('2026-09-18', '2026-09-18T17:00:00Z'),
  act('2026-09-19', '2026-09-19T12:54:25.223Z'),
  act('2026-09-20', '2026-09-20T16:58:57.882Z'),
  act('2026-09-21', '2026-09-21T15:00:00Z'),
];
const MARKER = '2026-09-20T16:56:16.376Z';

const tiles = (pages) => pages.flatMap((p) => p.cells.filter((c) => c.type === 'act'));

describe('Start over keeps every past act on the board', () => {
  test('all 7 acts are on the dashboard after a restart', () => {
    const runs = splitIntoRuns(GHENNO, '2026-09-21', { since: MARKER });
    const pages = buildPages(runs, { today: '2026-09-21', hasLoggableDay: false });
    expect(tiles(pages)).toHaveLength(7);
  });

  test('the restart splits the streak: Sep 15-19 is one streak, Sep 20 starts again at 1', () => {
    const runs = splitIntoRuns(GHENNO, '2026-09-21', { since: MARKER });
    expect(runs.map((r) => r.length)).toEqual([5, 2]);
    expect(runs[0].endedByRestart).toBe(true);
    expect(runs[1].isAlive).toBe(true);

    const pages = buildPages(runs, { today: '2026-09-21', hasLoggableDay: false });
    const all = tiles(pages);
    expect(all.find((t) => t.date === '2026-09-19').actNo).toBe(5);
    expect(all.find((t) => t.date === '2026-09-20').actNo).toBe(1);
    expect(all.find((t) => t.date === '2026-09-21').actNo).toBe(2);
  });

  test('the old streak is on an earlier page, the new one is the current board', () => {
    const runs = splitIntoRuns(GHENNO, '2026-09-21', { since: MARKER });
    const pages = buildPages(runs, { today: '2026-09-21', hasLoggableDay: false });
    const current = pages[pages.length - 1];
    expect(current.type).toBe('current');
    expect(tiles([current]).map((t) => t.date)).toEqual(['2026-09-20', '2026-09-21']);
  });

  test('restart right now: past acts stay, today is a fresh Day 1 with nothing logged', () => {
    const rows = GHENNO.slice(0, 5); // last act Sep 19
    const runs = splitIntoRuns(rows, '2026-09-20', { since: MARKER });
    expect(runs).toHaveLength(1);
    expect(runs[0].endedByRestart).toBe(true);
    expect(runs[0].isAlive).toBe(false);

    const pages = buildPages(runs, { today: '2026-09-20', hasLoggableDay: true });
    expect(tiles(pages)).toHaveLength(5);
    const current = pages[pages.length - 1];
    expect(current.type).toBe('current');
    expect(tiles([current])).toHaveLength(0);
    expect(current.cells.some((c) => c.type === 'next')).toBe(true);

    const n = numbersFromRuns(runs, { today: '2026-09-20' });
    expect(n.dayOf).toBe(1);
    expect(n.streak).toBe(0);
    expect(n.loggedToday).toBe(false);
  });

  test('restart after logging today: today\'s act stays in the old streak, Day 1 is open', () => {
    const rows = [...GHENNO.slice(0, 5), act('2026-09-20', '2026-09-20T15:00:00Z')];
    const runs = splitIntoRuns(rows, '2026-09-20', { since: MARKER });
    const pages = buildPages(runs, { today: '2026-09-20', hasLoggableDay: true });
    expect(tiles(pages)).toHaveLength(6);
    const n = numbersFromRuns(runs, { today: '2026-09-20' });
    expect(n.dayOf).toBe(1);
    expect(n.loggedToday).toBe(false);
  });

  test('with no restart nothing changes: one 7-day streak', () => {
    const runs = splitIntoRuns(GHENNO, '2026-09-21');
    expect(runs.map((r) => r.length)).toEqual([7]);
    expect(runs[0].endedByRestart).toBe(false);
  });

  test('loadRuns no longer drops acts saved before the marker', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'lib', 'runs.js'), 'utf8');
    expect(src).not.toMatch(/gte\('completed_at', since\)/);
    expect(src).toMatch(/splitIntoRuns\(data, undefined, \{ since \}\)/);
  });
});
