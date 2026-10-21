// Backlog 70 (Gary, 21 Oct 2026): keep Restart, call it "Start over at Day 1",
// and let it be undone from Home for 24 hours. Bridget tapped Restart by
// mistake on 30 Sep and had to be fixed by hand in SQL.

const fs   = require('fs');
const path = require('path');
import { canUndoRestart, UNDO_WINDOW_MS } from '../src/lib/restartUndo';

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('canUndoRestart', () => {
  const now = Date.parse('2026-10-21T15:00:00Z');

  test('within 24 hours: can undo', () => {
    expect(canUndoRestart('2026-10-21T14:00:00Z', now)).toBe(true);
    expect(canUndoRestart(new Date(now - UNDO_WINDOW_MS + 1000).toISOString(), now)).toBe(true);
  });

  test('after 24 hours: cannot', () => {
    expect(canUndoRestart(new Date(now - UNDO_WINDOW_MS).toISOString(), now)).toBe(false);
    expect(canUndoRestart('2026-10-01T00:00:00Z', now)).toBe(false);
  });

  test('no marker, a bad value, or a future time: cannot', () => {
    expect(canUndoRestart(null, now)).toBe(false);
    expect(canUndoRestart('not a date', now)).toBe(false);
    expect(canUndoRestart('2026-10-22T00:00:00Z', now)).toBe(false);
  });
});

describe('wording and Undo are wired in', () => {
  test('Home: renamed buttons and an Undo that clears the marker', () => {
    const src = read('src/screens/HomeScreen.js');
    expect(src).toMatch(/Start over at Day 1/);
    expect(src).not.toMatch(/label="↺ Restart"/);
    expect(src).not.toMatch(/label="Restart"/);
    expect(src).toMatch(/canUndoRestart\(restartAt\)/);
    expect(src).toMatch(/update\(\{ last_restart_at: null \}\)/);
  });

  test('Settings: renamed and mentions the 24-hour undo', () => {
    const src = read('src/screens/SettingsScreen.js');
    expect(src).toMatch(/label="Start over at Day 1"/);
    expect(src).toMatch(/undo this from the Home screen for 24 hours/);
  });
});

// Gary, 21 Oct 2026: "Start over should make today Day 1 with no act in today
// completed." Acts saved before the marker - even one from earlier today - are
// left out of the new streak (not deleted; Undo brings them back).
import { rowsSince, streakDayNumbers } from '../src/lib/dayNumbers';

describe('start over: today is Day 1 with nothing logged', () => {
  const rows = [
    { id: 1, local_date: '2026-10-20', completed_at: '2026-10-20T17:00:00+00:00' },
    { id: 2, local_date: '2026-10-21', completed_at: '2026-10-21T15:00:00+00:00' }, // today, before start over
  ];
  const marker = '2026-10-21T16:20:00.000Z';

  test('acts before the marker are not part of the new streak', () => {
    expect(rowsSince(rows, marker)).toEqual([]);
  });

  test('the act logged today after starting over is Day 1', () => {
    const since = rowsSince(rows, marker).map((r) => r.local_date);
    expect(streakDayNumbers([...since, '2026-10-21']).get('2026-10-21')).toBe(1);
  });

  test('no marker: every act counts', () => {
    expect(rowsSince(rows, null)).toHaveLength(2);
  });

  test('the dashboard and the save both use the marker', () => {
    expect(read('src/screens/DashboardView.js')).toMatch(/loadRuns\(phone, \{ since \}\)/);
    expect(read('src/lib/runs.js')).toMatch(/gte\('completed_at', since\)/);
    expect(read('src/screens/MyStoryScreen.js')).toMatch(/rowsSince\(rowsNow \|\| \[\], since\)/);
  });
});
