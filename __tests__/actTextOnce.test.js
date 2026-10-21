import {
  sameActText, buildActShareMessage, buildInviteMessage, buildSocialMessage,
} from '../src/lib/shareMessage';

// Backlog 84 (21 Oct 2026, David): an act picked from the list and saved with
// the same words as its story appeared twice - on the Act Completed screen and
// in shares. It should appear once.

const TITLE = 'Forgave myself for something small';
const STORY = 'Forgave myself for something small.';

const count = (haystack, needle) => haystack.toLowerCase().split(needle.toLowerCase()).length - 1;

describe('sameActText', () => {
  test('ignores case, spacing and trailing punctuation', () => {
    expect(sameActText(TITLE, STORY)).toBe(true);
    expect(sameActText('  forgave  myself for something small!! ', TITLE)).toBe(true);
  });

  test('different words are different', () => {
    expect(sameActText(TITLE, 'Forgave myself for something big')).toBe(false);
  });

  test('empty text never matches', () => {
    expect(sameActText('', '')).toBe(false);
    expect(sameActText(null, undefined)).toBe(false);
  });
});

describe('shares say the act once', () => {
  test('More / share-all caption', () => {
    const msg = buildActShareMessage({ dayNumber: 3, actTitle: TITLE, story: STORY });
    expect(count(msg, TITLE)).toBe(1);
  });

  test('Text / Email invitation', () => {
    const msg = buildInviteMessage({ dayNumber: 3, actTitle: TITLE, story: STORY, inviteUrl: 'https://x.y/z' });
    expect(count(msg, TITLE)).toBe(1);
  });

  test('social post', () => {
    const msg = buildSocialMessage({ dayNumber: 3, actTitle: TITLE, story: STORY, inviteUrl: 'https://x.y/z' });
    expect(count(msg, TITLE)).toBe(1);
  });

  test('a story that adds detail is still included', () => {
    const msg = buildActShareMessage({ dayNumber: 3, actTitle: TITLE, story: 'Let go of being late to dinner.' });
    expect(msg).toContain('Let go of being late to dinner.');
    expect(msg).toContain(TITLE);
  });
});
