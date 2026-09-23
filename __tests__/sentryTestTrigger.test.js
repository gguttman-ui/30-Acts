// Backlog item 43, 23 Sep 2026: five quick taps on the Settings build stamp
// send a test message to Sentry.

import { createTapCounter } from '../src/lib/tapCounter';

const fs   = require('fs');
const path = require('path');

describe('tap counter', () => {
  test('fires on the fifth tap within the window', () => {
    const tap = createTapCounter({ count: 5, windowMs: 3000 });
    expect([0, 100, 200, 300].map((t) => tap(t))).toEqual([false, false, false, false]);
    expect(tap(400)).toBe(true);
  });

  test('starts over after firing', () => {
    const tap = createTapCounter({ count: 5, windowMs: 3000 });
    [0, 1, 2, 3, 4].forEach((t) => tap(t));
    expect(tap(5)).toBe(false);
  });

  test('slow taps never fire', () => {
    const tap = createTapCounter({ count: 5, windowMs: 3000 });
    const fired = [0, 1000, 2000, 3000, 4000, 5000, 6000].map((t) => tap(t));
    expect(fired.some(Boolean)).toBe(false);
  });
});

describe('Settings wires the build stamp to Sentry', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'SettingsScreen.js'), 'utf8');

  test('imports Sentry and the tap counter', () => {
    expect(src).toMatch(/import \* as Sentry from '@sentry\/react-native';/);
    expect(src).toMatch(/import \{ createTapCounter \} from '\.\.\/lib\/tapCounter';/);
  });

  test('the build stamp is tappable and sends a captureMessage', () => {
    expect(src).toMatch(/onPress=\{handleBuildStampTap\}/);
    expect(src).toMatch(/Sentry\.captureMessage\(/);
  });
});
