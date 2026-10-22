// Backlog 78: updates are checked whenever the app comes to the front, and a
// downloaded update is switched to only on the Home tab - never mid-story.

const fs   = require('fs');
const path = require('path');
import { createUpdateGate } from '../src/lib/updateGate';

const read  = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('update gate', () => {
  test('update ready while on Home: switches now', async () => {
    const reload = jest.fn();
    const gate = createUpdateGate(reload);
    gate.noteRoute('Home');
    gate.markReady();
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('update ready while writing a story: waits until Home', async () => {
    const reload = jest.fn();
    const gate = createUpdateGate(reload);
    gate.noteRoute('MyStory');
    gate.markReady();
    await flush();
    expect(reload).not.toHaveBeenCalled();
    gate.noteRoute('Me');
    await flush();
    expect(reload).not.toHaveBeenCalled();
    gate.noteRoute('Home');
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('never switches during sign-up or before any screen is known', async () => {
    const reload = jest.fn();
    const gate = createUpdateGate(reload);
    gate.markReady();
    gate.noteRoute('Auth');
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });

  test('switches only once', async () => {
    const reload = jest.fn();
    const gate = createUpdateGate(reload);
    gate.noteRoute('Home');
    gate.markReady();
    gate.noteRoute('Home');
    gate.noteRoute('Home');
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('wired in', () => {
  test('App.js checks for updates at launch and on returning to the front', () => {
    const src = read('App.js');
    expect(src).toMatch(/checkForUpdateInBackground\(\)/);
    expect(src).toMatch(/next === 'active'\)[\s\S]{0,30}checkForUpdateInBackground\(\)/);
  });

  test('the navigator reports the current screen to the gate', () => {
    const src = read('src/navigation/index.js');
    expect(src).toMatch(/onStateChange=\{noteRoute\}/);
    expect(src).toMatch(/updateGate\.noteRoute/);
  });

  test('the background check never runs in development and never throws', () => {
    const src = read('src/lib/appUpdates.js');
    expect(src).toMatch(/__DEV__ \|\| !Updates\.isEnabled/);
    expect(src).toMatch(/catch \(e\)/);
  });
});
