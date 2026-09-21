// Restart Challenge has to reach App.handleRestart.
//
// THE BUG: `onRestart` was threaded App.js -> AppNavigator -> MainTabs and
// handed to HomeScreen, but MainTabs' renderSettings never passed it on, and
// SettingsScreen's props signature did not even name it. So the Settings
// "Restart" button's confirm dialog called `onStartChallenge`, which is only
// `await reloadDays()` — a plain re-read. The dialog appeared, the user tapped
// "Yes, restart", nothing wrote `last_restart_at`, and the old streak came
// straight back on the next load.
//
// Reported by Ghenno, verified in staging by Gary on 2026-09-20.
//
// Every link in that chain is asserted here because the failure was a silent
// gap in the middle of it — each end looked correct on its own.
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const APP      = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const NAV      = fs.readFileSync(path.join(root, 'src', 'navigation', 'index.js'), 'utf8');
const SETTINGS = fs.readFileSync(path.join(root, 'src', 'screens', 'SettingsScreen.js'), 'utf8');

describe('the Restart button reaches the handler that writes the marker', () => {
  test('SettingsScreen accepts an onRestart prop', () => {
    const signature = SETTINGS.match(/export default function SettingsScreen\(\{[\s\S]*?\}\)/);
    expect(signature).not.toBeNull();
    expect(signature[0]).toContain('onRestart');
  });

  test('the confirm dialog calls onRestart, not onStartChallenge', () => {
    const block = SETTINGS.match(/const handleRestart = \(\) => \{[\s\S]*?\n  \};/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('onPress: onRestart');
    // This exact line WAS the bug.
    expect(block[0]).not.toContain('onPress: onStartChallenge');
  });

  test('MainTabs passes onRestart down to SettingsScreen', () => {
    // The missing link. HomeScreen got it; Settings did not.
    const block = NAV.match(/const renderSettings = \(props\) => \([\s\S]*?\n  \);/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('onRestart={onRestart}');
  });

  test('App.js still supplies handleRestart to the navigator', () => {
    expect(APP).toContain('onRestart={handleRestart}');
  });

  test('handleRestart writes the last_restart_at marker the grid filters by', () => {
    // If this stops being written, Restart goes quiet again in exactly the same
    // way — the dialog still appears and still does nothing.
    const block = APP.match(/const handleRestart = async \(\) => \{[\s\S]*?\n  \};/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('last_restart_at');
    expect(block[0]).toContain("from('profiles')");
  });
});

describe('fixing Restart did not break Start', () => {
  test('the Start button still calls onStartChallenge', () => {
    // onStartChallenge is the right handler for a first start — it just loads
    // the grid. Only Restart was wired to it wrongly.
    expect(SETTINGS).toMatch(/<Btn label="Start[^"]*" onPress=\{onStartChallenge\} \/>/);
  });

  test('onStartChallenge is still threaded to Settings', () => {
    const block = NAV.match(/const renderSettings = \(props\) => \([\s\S]*?\n  \);/);
    expect(block[0]).toContain('onStartChallenge={onStartChallenge}');
  });
});
