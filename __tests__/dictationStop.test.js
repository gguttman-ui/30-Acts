// Backlog item 54, fixed 23 Sep 2026.
//
// Proven on device: a dictation session kept running through a blocked Save
// and through typing and clearing the story box. With continuous recognition,
// iOS resends the whole transcript since the session began, so every earlier
// sentence came back into a box the person had just emptied.
//
// MyStoryScreen imports native modules, so these assert against the source,
// the same approach streakNoCap.test.js and shareDayNumber.test.js use.

const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'MyStoryScreen.js'), 'utf8');

function body(fnHead) {
  const i = src.indexOf(fnHead);
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, i + 600);
}

describe('dictation stops when the person takes over (item 54)', () => {
  test('the story box routes edits through handleStoryChange, not raw setStory', () => {
    expect(src).toMatch(/onChangeText=\{handleStoryChange\}/);
    expect(src).not.toMatch(/onChangeText=\{setStory\}/);
  });

  test('typing cuts dictation before updating the story', () => {
    const b = body('const handleStoryChange');
    expect(b.indexOf('cutDictation()')).toBeGreaterThan(-1);
    expect(b.indexOf('cutDictation()')).toBeLessThan(b.indexOf('setStory(text)'));
  });

  test('Save cuts dictation first', () => {
    const b = body('const handleSave = async () => {');
    expect(b.indexOf('cutDictation()')).toBeGreaterThan(-1);
    expect(b.indexOf('cutDictation()')).toBeLessThan(b.indexOf('storyValid'));
  });

  test('results after a cut are discarded', () => {
    const b = body("useSpeechEvent('result'");
    expect(b.indexOf('if (discardResultsRef.current) return;')).toBeGreaterThan(-1);
    expect(b.indexOf('if (discardResultsRef.current) return;')).toBeLessThan(b.indexOf('setStory('));
  });

  test('a new mic session clears the discard flag', () => {
    const b = body('const handleMicPress');
    expect(b).toMatch(/discardResultsRef\.current = false;[\s\S]*startListening\(\)/);
  });

  test('the 2 Sep baseline in startListening is untouched', () => {
    const b = body('const startListening = async () => {');
    expect(b).toMatch(/dictationBaseRef\.current = story;/);
    expect(b).not.toMatch(/discardResultsRef/);
  });
});
