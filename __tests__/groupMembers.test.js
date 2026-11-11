// Item 103 (Ghenno, 9 Nov 2026): tapping a group in My Groups opens the group
// screen with its members list (leaderboard: who joined, acts, first/last act).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/MySponsorsScreen.js'), 'utf8');
const detail = fs.readFileSync(path.join(__dirname, '..', 'src/screens/SponsorDetailScreen.js'), 'utf8');

test('created groups link to the members screen', () => {
  expect(src).toMatch(/View members & activity/);
  expect((src.match(/navigate\('SponsorDetail', \{ challengeId: c\.id \}\)/g) || []).length).toBe(2);
});
test('group screen lists members with acts and, for the sponsor, last act and days since joining', () => {
  expect(detail).toMatch(/Leaderboard/);
  expect(detail).toMatch(/isSponsor && p\.lastActAt/);
  expect(detail).toMatch(/since joining/);
});
