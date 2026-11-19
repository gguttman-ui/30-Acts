// David's UX fix 2 (19 Nov 2026): Home draws one layout while it loads.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const DASH = read('src', 'screens', 'DashboardView.js');
const HOME = read('src', 'screens', 'HomeScreen.js');

describe('Home does not jump while loading', () => {
  test('placeholder only on the first load for a person; reloads keep the board', () => {
    expect(DASH).toMatch(/if \(loadedPhone\.current !== phone\) setLoading\(true\);/);
    expect(DASH).toMatch(/loadedPhone\.current = phone;/);
    expect(DASH).not.toMatch(/\(async \(\) => \{\s*setLoading\(true\);/);
  });
  test('no phone yet = keep the placeholder (no flash of an empty board)', () => {
    expect(DASH).toMatch(/if \(!phone\) return undefined;/);
  });
  test('the placeholder is the Today card and 30 tiles, not a spinner', () => {
    expect(DASH).toMatch(/if \(loading\) return <DashboardSkeleton \/>;/);
    expect(DASH).toMatch(/export function DashboardSkeleton\(\)/);
    expect(DASH).toMatch(/Array\.from\(\{ length: CHALLENGE_LEN \}, \(_, i\) => \(\s*<View key=\{i\} style=\{\[s\.dayCell, s\.dayCellSkel\]\} \/>/);
  });
  test('Home shows the normal layout during the first load (no spinner screen)', () => {
    expect(HOME).toMatch(/if \(!days && !daysReloading\) \{/);
    expect(HOME).not.toMatch(/if \(daysReloading\) \{\s*return \(\s*<View style=\{s\.empty\}>\s*<ActivityIndicator/);
  });
});
