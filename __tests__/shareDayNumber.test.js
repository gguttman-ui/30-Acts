// Backlog item 18, fixed 23 Sep 2026.
//
// The share caption must use the day number shown on the grid
// (route.params.day.dayNumber), never the day_number stored on the completion
// row. The stored value goes stale after Restart Challenge renumbers the board,
// so re-sharing an old act printed the wrong day.
//
// MyStoryScreen imports native modules, so this asserts against the source
// text, the same approach streakNoCap.test.js uses.

const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'MyStoryScreen.js'), 'utf8');

describe('share caption day number comes from the grid', () => {
  test('the stored day_number never feeds setDayNumber', () => {
    expect(src).not.toMatch(/setDayNumber\(\s*completion\??\.day_number\s*\)/);
  });

  test('dayNumber is still initialised from route.params.day', () => {
    expect(src).toMatch(/useState\(route\?\.params\?\.day\?\.dayNumber/);
  });
});
