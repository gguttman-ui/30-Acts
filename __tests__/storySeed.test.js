// What lands in the story box when the act picker sends the user back.
//
// The bug: "+ Create a New Act" passes the Search text back as draftStory, and
// MyStoryScreen only ever looked at preselectedAct. A tester typed "Did dishes
// to help a friend", got no matches, tapped Create a New Act, and arrived at an
// empty box. 2026-08-31.
import { nextStorySeed, applyStorySeed } from '../src/lib/storySeed';

const STORY_MAX = 300;

describe('nextStorySeed', () => {
  test('the searched phrase becomes the seed — the reported bug', () => {
    expect(nextStorySeed({ draftStory: 'Did dishes to help a friend' }))
      .toBe('Did dishes to help a friend ');
  });

  test('a chosen act becomes the seed, as a sentence', () => {
    expect(nextStorySeed({ actTitle: 'Mowed a lawn' })).toBe('Mowed a lawn. ');
  });

  test('a chosen act wins over the draft sent alongside it', () => {
    // The picker sends both when an act is picked. Preferring the draft would
    // make choosing an act appear to do nothing.
    expect(nextStorySeed({ actTitle: 'Mowed a lawn', draftStory: 'something else' }))
      .toBe('Mowed a lawn. ');
  });

  test('nothing to apply gives an empty seed, not a stray space', () => {
    for (const args of [{}, undefined, { draftStory: '   ' }, { actTitle: '  ' }]) {
      expect(nextStorySeed(args)).toBe('');
    }
  });

  test('the seed ends with a space so typing continues naturally', () => {
    expect(nextStorySeed({ draftStory: 'Did dishes' })).toMatch(/ $/);
    expect(nextStorySeed({ actTitle: 'Did dishes' })).toMatch(/ $/);
  });

  test('a seed longer than the box cap is cut to fit', () => {
    const long = 'x'.repeat(400);
    expect(nextStorySeed({ draftStory: long, maxLength: STORY_MAX })).toHaveLength(STORY_MAX);
  });

  test('surrounding whitespace in the search box does not survive', () => {
    expect(nextStorySeed({ draftStory: '   Did dishes   ' })).toBe('Did dishes ');
  });
});

describe('applyStorySeed', () => {
  test('fills an empty box', () => {
    expect(applyStorySeed({ current: '', seed: 'Did dishes ' })).toBe('Did dishes ');
  });

  test('fills a box holding only whitespace', () => {
    expect(applyStorySeed({ current: '   \n ', seed: 'Did dishes ' })).toBe('Did dishes ');
  });

  test('NEVER overwrites what the person wrote themselves', () => {
    const mine = 'I sat with my neighbour for an hour.';
    expect(applyStorySeed({ current: mine, seed: 'Did dishes ' })).toBe(mine);
  });

  test('replaces a seed we put there ourselves — changing your mind works', () => {
    expect(applyStorySeed({
      current: 'Mowed a lawn. ', lastSeed: 'Mowed a lawn. ', seed: 'Did dishes ',
    })).toBe('Did dishes ');
  });

  test('an empty seed changes nothing', () => {
    expect(applyStorySeed({ current: 'my words', seed: '' })).toBe('my words');
    expect(applyStorySeed({ current: '', seed: '' })).toBe('');
  });

  test('text typed ON TOP of a seed counts as the person\'s own', () => {
    // They accepted the suggestion and kept writing. That is theirs now.
    const edited = 'Mowed a lawn. It took two hours and she cried.';
    expect(applyStorySeed({
      current: edited, lastSeed: 'Mowed a lawn. ', seed: 'Did dishes ',
    })).toBe(edited);
  });

  test('the full reported journey ends with the sentence in the box', () => {
    // Picker → no matches → "+ Create a New Act" → back to an already-mounted
    // MyStory with an empty box.
    const seed = nextStorySeed({ draftStory: 'Did dishes to help a friend' });
    expect(applyStorySeed({ current: '', seed, lastSeed: '' }))
      .toBe('Did dishes to help a friend ');
  });

  test('no undefined or null leaks into the box', () => {
    for (const args of [{}, undefined, { seed: 'x ' }]) {
      expect(applyStorySeed(args)).not.toMatch(/undefined|null/);
    }
  });
});
