// 3 Nov 2026, Gary: "I place the cursor where I want to add the new data but it
// is added at the end" (using the app's microphone). Spoken words now go at the
// cursor. Only the join changed; the mic's start/stop (item 54) did not.
const fs   = require('fs');
const path = require('path');
import { splitAtCursor, joinDictation } from '../src/lib/dictationInsert';

const TEXT = 'I helped my neighbor. She was happy.';

describe('splitAtCursor', () => {
  test('cursor in the middle splits the text there', () => {
    expect(splitAtCursor(TEXT, { start: 21, end: 21 })).toEqual({ before: 'I helped my neighbor.', after: ' She was happy.' });
  });
  test('no cursor known = the end, as before', () => {
    expect(splitAtCursor(TEXT, null)).toEqual({ before: TEXT, after: '' });
  });
  test('a selection is replaced; out-of-range positions are clamped', () => {
    expect(splitAtCursor('abc def ghi', { start: 4, end: 7 })).toEqual({ before: 'abc ', after: ' ghi' });
    expect(splitAtCursor('abc', { start: 99, end: 99 })).toEqual({ before: 'abc', after: '' });
  });
});

describe('joinDictation', () => {
  test('words land at the cursor with spaces where needed', () => {
    const { before, after } = splitAtCursor(TEXT, { start: 21, end: 21 });
    expect(joinDictation({ before, after, transcript: 'I carried her groceries.' }))
      .toBe('I helped my neighbor. I carried her groceries. She was happy.');
  });
  test('inserting mid-word gets spaces on both sides', () => {
    expect(joinDictation({ before: 'I helped', after: 'neighbor', transcript: 'my' })).toBe('I helped my neighbor');
  });
  test('no space added before punctuation that follows', () => {
    expect(joinDictation({ before: 'I helped', after: '.', transcript: 'a friend' })).toBe('I helped a friend.');
  });
  test('at the end it behaves like the old append', () => {
    expect(joinDictation({ before: 'Hello', after: '', transcript: 'world' })).toBe('Hello world');
    expect(joinDictation({ before: '', after: '', transcript: 'Hello' })).toBe('Hello');
  });
  test('the cap shortens the spoken words, never the text after the cursor', () => {
    const out = joinDictation({ before: 'ab', after: ' xyz', transcript: '1234567890', max: 10 });
    expect(out).toBe('ab 123 xyz');
    expect(out.length).toBe(10);
  });
  test('empty transcript leaves the text unchanged', () => {
    expect(joinDictation({ before: 'a', after: 'b', transcript: '  ' })).toBe('ab');
  });
});

describe('MyStoryScreen wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'MyStoryScreen.js'), 'utf8');
  test('the box reports its cursor, and the mic splits there when it starts', () => {
    expect(src).toContain('onSelectionChange={(e) => { selectionRef.current = e.nativeEvent.selection; }}');
    expect(src).toContain('dictationBaseRef.current = splitAtCursor(story, selectionRef.current);');
    expect(src).toContain('setStory(joinDictation({ before, after, transcript, max: STORY_MAX }));');
  });
  test('item 54 safeguards are still in place', () => {
    expect(src).toContain('if (discardResultsRef.current) return;');
    expect(src).toMatch(/onChangeText=\{handleStoryChange\}/);
  });
});
