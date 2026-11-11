import { TOUR_PAGES, isLastPage, showSkip } from '../src/lib/tourPages';
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('first-run tour (items 101 + 102)', () => {
  test('five pages in the agreed order', () => {
    expect(TOUR_PAGES.map((p) => p.key)).toEqual(['welcome', 'pick', 'days', 'tree', 'invite']);
  });
  test('welcome explains the movement and the 30-day idea', () => {
    const w = TOUR_PAGES[0];
    expect(w.body).toMatch(/movement/);
    expect(w.note).toMatch(/30 days/);
    expect(w.button).toBe('Show me how');
  });
  test('tree stages match TreeScreen thresholds', () => {
    expect(TOUR_PAGES[3].stages.map((s) => s.range)).toEqual(['1-10 acts', '11-20 acts', '21+ acts']);
    const tree = read('src/screens/TreeScreen.js');
    expect(tree).toMatch(/count <= 10\) return 'Sapling'/);
    expect(tree).toMatch(/count <= 20\) return 'Young Tree'/);
  });
  test('Skip on every page except the last; last button starts', () => {
    expect(showSkip(0)).toBe(true);
    expect(showSkip(TOUR_PAGES.length - 1)).toBe(false);
    expect(isLastPage(TOUR_PAGES.length - 1)).toBe(true);
    expect(TOUR_PAGES[TOUR_PAGES.length - 1].button).toBe("Let's get started");
  });
  test('no mention of photo or video proof (removed from the app)', () => {
    const all = JSON.stringify(TOUR_PAGES) + read('src/screens/OnboardingScreen.js');
    expect(all).not.toMatch(/photo|video/i);
  });
  test('Help offers the tour again', () => {
    expect(read('src/screens/HelpScreen.js')).toMatch(/navigate\('Tour'\)/);
    expect(read('src/navigation/index.js')).toMatch(/name="Tour"/);
  });
  test('from Help, Skip and the last button go to Home (the dashboard)', () => {
    expect(read('src/navigation/index.js')).toMatch(/OnboardingScreen onDone=\{\(\) => props\.navigation\.navigate\('Main', \{ screen: 'Home' \}\)\}/);
  });
});

test('owner tool replays the first-time start on this phone only', () => {
  const home = read('src/screens/HomeScreen.js');
  expect(home).toMatch(/Replay first-time start/);
  expect(home).toMatch(/multiRemove\(\['hasSeenOnboarding', 'remembered_phone'\]\)/);
  expect(read('App.js')).toMatch(/getItem\('hasSeenOnboarding'\)/);
});

test('staging-only replay tool in Help (production never shows it)', () => {
  const help = read('src/screens/HelpScreen.js');
  expect(help).toMatch(/Updates\.channel === 'preview' \?/);
  expect(help).toMatch(/multiRemove\(\['hasSeenOnboarding', 'remembered_phone'\]\)/);
});
