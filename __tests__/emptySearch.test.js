// David's UX review Q5 (17 Nov 2026): empty act search names what was searched
// and offers "Write my own act" with that text filled in.
import { emptyActsMessage, draftFromSearch } from '../src/lib/emptySearch';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', f), 'utf8');

test('names the search text', () => {
  expect(emptyActsMessage('  bout a cofee ', false)).toBe('No match for "bout a cofee".');
});

test('never mentions time or cost for a plain search', () => {
  expect(emptyActsMessage('xyz', false)).not.toMatch(/time|cost/i);
});

test('no search text', () => {
  expect(emptyActsMessage('', true)).toBe('No acts match those filters.');
  expect(emptyActsMessage('', false)).toBe('No acts found.');
});

test('draft starts with the search text', () => {
  expect(draftFromSearch('  helped a neighbor ')).toBe('helped a neighbor');
});

test('both act lists use the new message; the picker offers Write my own act', () => {
  for (const f of ['ChooseActScreen.js', 'CreateChallengeScreen.js']) {
    const s = read(f);
    expect(s).not.toMatch(/Try widening the time or cost/);
    expect(s).toMatch(/emptyActsMessage\(search/);
  }
  const pick = read('ChooseActScreen.js');
  expect(pick).toMatch(/label="Write my own act"/);
  expect(pick).toMatch(/draftStory: draftFromSearch\(search\)/);
});
