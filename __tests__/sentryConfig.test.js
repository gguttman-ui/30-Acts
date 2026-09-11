// Sentry sampling guard.
//
// THE BUG THIS EXISTS FOR: replaysSessionSampleRate was 0.1, which records a
// tenth of ALL sessions whether or not anything goes wrong. Two people testing
// burned 40 of the plan's 50 monthly replays in a fortnight while the error
// count sat at zero — 40 recordings of nothing happening, and no room left for
// a replay of a real crash.
//
// Sentry's config lives in App.js, which imports React Native and cannot be
// required from a plain unit test, so this reads the source. That is the point:
// the value is a one-character edit away from silently costing the quota again.
const fs   = require('fs');
const path = require('path');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

/** Pull a numeric Sentry.init option out of the App.js source. */
function optionValue(name) {
  const m = APP_JS.match(new RegExp(`^\\s*${name}\\s*:\\s*([0-9.]+)\\s*,`, 'm'));
  return m ? Number(m[1]) : null;
}

describe('Sentry replay sampling', () => {
  test('both replay options are actually present in App.js', () => {
    // If this fails, the options were renamed or removed and the assertions
    // below would pass vacuously.
    expect(optionValue('replaysSessionSampleRate')).not.toBeNull();
    expect(optionValue('replaysOnErrorSampleRate')).not.toBeNull();
  });

  test('no replays are recorded for uneventful sessions', () => {
    // Raise this only when there are real users whose ordinary behaviour is
    // worth watching — and check the plan's monthly replay allowance first.
    expect(optionValue('replaysSessionSampleRate')).toBe(0);
  });

  test('every session that errors is recorded', () => {
    // This is the replay that earns its keep: a crash report arrives with the
    // taps that led to it. Do not turn it down to save quota; turn the session
    // rate down instead.
    expect(optionValue('replaysOnErrorSampleRate')).toBe(1);
  });
});

describe('Sentry init is wired up at all', () => {
  test('Sentry.init is called and the app is wrapped', () => {
    expect(APP_JS).toMatch(/Sentry\.init\(/);
    expect(APP_JS).toMatch(/Sentry\.wrap\(/);
  });

  test('the replay integration is registered', () => {
    // Without this, both sample rates above are dead settings.
    expect(APP_JS).toMatch(/mobileReplayIntegration\(\)/);
  });
});
