// Item 93 (Janie, iPhone, 25-26 Oct 2026): after "Add yesterday's act", Home
// froze - taps did nothing - because the app moved on while the pop-up was
// still fading out. Act only once it has closed; show pop-ups only on Home.
import { createAfterClose } from '../src/lib/afterModalClose';
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('acting after a pop-up closes', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('waits for the pop-up to report it closed', () => {
    const go = jest.fn();
    const c = createAfterClose(500);
    c.schedule(go);
    jest.advanceTimersByTime(16);   // the old one-frame wait
    expect(go).not.toHaveBeenCalled();
    c.onDismiss();
    expect(go).toHaveBeenCalledTimes(1);
  });

  test('falls back after 500 ms if no close event arrives (Android)', () => {
    const go = jest.fn();
    const c = createAfterClose(500);
    c.schedule(go);
    jest.advanceTimersByTime(499);
    expect(go).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(go).toHaveBeenCalledTimes(1);
  });

  test('runs once even when both the close event and the fallback happen', () => {
    const go = jest.fn();
    const c = createAfterClose(500);
    c.schedule(go);
    c.onDismiss();
    jest.advanceTimersByTime(1000);
    c.onDismiss();
    expect(go).toHaveBeenCalledTimes(1);
  });

  test('a close with nothing scheduled does nothing', () => {
    expect(() => createAfterClose(500).onDismiss()).not.toThrow();
  });
});

describe('Home wiring', () => {
  const HOME = read('src/screens/HomeScreen.js');

  test('Add yesterday waits for the pop-up to close, not one frame', () => {
    const body = HOME.slice(HOME.indexOf('const handleAddYesterday'), HOME.indexOf('const handleMissedRestart'));
    expect(body).toMatch(/afterMissedClose\.schedule\(/);
    expect(body).not.toMatch(/requestAnimationFrame/);
  });

  test('Start over and Document "Yes" also wait', () => {
    expect(HOME).toMatch(/handleMissedRestart = \(\) => \{ setMissedPrompt\(false\); afterMissedClose\.schedule\(/);
    expect(HOME).toMatch(/afterDocumentClose\.schedule\(\(\) => navigation\.navigate\('MyStory'\)\)/);
  });

  test('the two pop-ups show only while Home is in front, and report closing', () => {
    expect(HOME).toMatch(/visible=\{missedPrompt && isFocused\}[^>]*onDismiss=\{afterMissedClose\.onDismiss\}/);
    expect(HOME).toMatch(/visible=\{documentPrompt && isFocused\}[^>]*onDismiss=\{afterDocumentClose\.onDismiss\}/);
  });
});

describe('the yesterday screen says yesterday', () => {
  test('placeholder follows the day being added', () => {
    const SRC = read('src/screens/MyStoryScreen.js');
    expect(SRC).toMatch(/const isBackfill = .*scheduledDate !== todayStr\(\)/);
    expect(SRC).toMatch(/isBackfill\s*\?\s*'What act of kindness did you do yesterday\?/);
  });
});
