// Backlog item 43, 23 Sep 2026: five quick taps on the build stamp send a test
// message to Sentry. Since 17 Nov 2026 (UX review Q3) the stamp lives in Help,
// behind the version line, and the Me page shows no build details.

import { createTapCounter } from '../src/lib/tapCounter';
import { versionLabel, buildDetails, NATIVE_BUILD } from '../src/lib/buildInfo';

const fs   = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', f), 'utf8');

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

describe('Q3: one version label, details hidden', () => {
  test('label is "Version 1.0.0 (build)"', () => {
    expect(versionLabel('1.0.0', 'ios')).toBe(`Version 1.0.0 (${NATIVE_BUILD.ios})`);
    expect(versionLabel('1.0.0', 'android')).toBe(`Version 1.0.0 (${NATIVE_BUILD.android})`);
  });

  test('details still name channel, update and database', () => {
    expect(buildDetails({ runtimeVersion: '1.0.0', channel: 'production', updateId: 'abcdef123456', db: 'production' }))
      .toBe('v1.0.0 · production · update abcdef12 · db production');
  });

  test('Me page no longer shows build details', () => {
    const src = read('SettingsScreen.js');
    expect(src).not.toMatch(/Updates\.updateId/);
    expect(src).not.toMatch(/DB_ENVIRONMENT/);
  });

  test('Help shows the label, and five taps reveal details and send the Sentry test', () => {
    const src = read('HelpScreen.js');
    expect(src).toMatch(/versionLabel\(appVersion, Platform\.OS\)/);
    expect(src).toMatch(/onPress=\{handleVersionTap\}/);
    expect(src).toMatch(/Sentry\.captureMessage\(/);
    expect(src).toMatch(/isStaging \|\| showDetails/);
  });
});
