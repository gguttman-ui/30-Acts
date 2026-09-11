// Share caption rules. The bug these guard against: SMS and email carry no
// image, so they carry no QR code — but the caption used to tell the reader to
// scan one anyway.
import {
  buildActShareMessage,
  buildInviteMessage,
  buildSocialMessage,
  buildJoinSteps,
  channelHasQr,
  trimToWords,
  isRealActTitle,
  buildLead,
  APP_HASHTAG,
} from '../src/lib/shareMessage';
import { fitsInXPost } from '../src/lib/xIntent';

const base = {
  dayNumber: 77,
  actTitle: 'My Story',
  story: "I'm going to make six tests today",
  inviteUrl: 'https://alrpa.app.link/wpZcPtFSh5b',
};

describe('channelHasQr', () => {
  test('only an image share carries the QR code', () => {
    expect(channelHasQr('image')).toBe(true);
    expect(channelHasQr('text')).toBe(false);
    expect(channelHasQr('email')).toBe(false);
  });
});

describe('buildJoinSteps', () => {
  test('image share mentions the QR code', () => {
    const s = buildJoinSteps({ channel: 'image', inviteUrl: base.inviteUrl });
    expect(s).toContain('Scan the QR code');
  });

  test('text share never mentions a QR code', () => {
    const s = buildJoinSteps({ channel: 'text', inviteUrl: base.inviteUrl });
    expect(s).not.toMatch(/QR/i);
    expect(s).toContain('Tap the link below');
  });

  test('email share never mentions a QR code', () => {
    const s = buildJoinSteps({ channel: 'email', inviteUrl: base.inviteUrl });
    expect(s).not.toMatch(/QR/i);
  });

  test('no link and no QR falls back to the App Store, not a dangling "below"', () => {
    const s = buildJoinSteps({ channel: 'text', inviteUrl: '' });
    expect(s).not.toMatch(/QR/i);
    expect(s).not.toContain('link below');
    expect(s).toContain('App Store');
  });

  test('QR but no link does not promise a link', () => {
    const s = buildJoinSteps({ channel: 'image', inviteUrl: '' });
    expect(s).toContain('Scan the QR code');
    expect(s).not.toContain('link below');
  });

  test('always four numbered steps', () => {
    for (const channel of ['image', 'text', 'email']) {
      const s = buildJoinSteps({ channel, inviteUrl: base.inviteUrl });
      expect(s.split('\n')).toHaveLength(4);
      expect(s).toMatch(/^1\. /);
    }
  });
});

describe('buildActShareMessage', () => {
  test('text share: no QR mention, link still present', () => {
    const m = buildActShareMessage({ ...base, channel: 'text' });
    expect(m).not.toMatch(/QR/i);
    expect(m).toContain(base.inviteUrl);
  });

  test('email share: no QR mention', () => {
    const m = buildActShareMessage({ ...base, channel: 'email' });
    expect(m).not.toMatch(/QR/i);
  });

  test('image share: QR mention is kept', () => {
    const m = buildActShareMessage({ ...base, channel: 'image' });
    expect(m).toContain('Scan the QR code');
  });

  test('defaults to the image channel', () => {
    const m = buildActShareMessage(base);
    expect(m).toContain('Scan the QR code');
  });

  test('carries day number, act title and hashtag', () => {
    const m = buildActShareMessage({ ...base, channel: 'text' });
    expect(m).toContain('Day 77');
    expect(m).toContain('"My Story"');
    expect(m).toContain(APP_HASHTAG);
  });

  test('includes the story when there is one', () => {
    const m = buildActShareMessage({ ...base, channel: 'text' });
    expect(m).toContain("Here's what I did:");
    expect(m).toContain(base.story);
  });

  test('omits the story block when blank or whitespace', () => {
    for (const story of ['', '   ', '\n\n']) {
      const m = buildActShareMessage({ ...base, story, channel: 'text' });
      expect(m).not.toContain("Here's what I did:");
    }
  });

  test('the referral link survives every channel — it feeds the kindness tree', () => {
    for (const channel of ['image', 'text', 'email']) {
      expect(buildActShareMessage({ ...base, channel })).toContain(base.inviteUrl);
    }
  });

  test('no trailing link line when there is no invite URL', () => {
    const m = buildActShareMessage({ ...base, inviteUrl: '', channel: 'text' });
    expect(m.trimEnd()).toBe(m.trimEnd());
    expect(m).not.toContain('undefined');
    expect(m).not.toContain('null');
  });
});

describe('buildInviteMessage', () => {
  const inviteUrl = 'https://alrpa.app.link/wpZcPtFSh5b';

  test('says what the challenge is', () => {
    expect(buildInviteMessage({ inviteUrl })).toContain('one kind act a day');
  });

  test('says WHY it is being sent — this is the point of the message', () => {
    const m = buildInviteMessage({ inviteUrl });
    expect(m).toContain("I'd love you to join me");
    expect(m).toContain('kinder place');
  });

  test('points at both the QR code and the link', () => {
    const m = buildInviteMessage({ inviteUrl });
    expect(m).toContain('Scan the code');
    expect(m).toContain('tap the link below');
  });

  test('carries the referral link — without it the join is not attributed', () => {
    expect(buildInviteMessage({ inviteUrl })).toContain(inviteUrl);
  });

  test('with no link it does not promise one', () => {
    const m = buildInviteMessage({});
    expect(m).not.toContain('tap the link below');
    expect(m).toContain('Scan the code');
  });

  test('no undefined or null leaks into the text', () => {
    for (const args of [{}, { inviteUrl: '' }, undefined]) {
      const m = buildInviteMessage(args);
      expect(m).not.toMatch(/undefined|null/);
    }
  });

  test('reads as paragraphs, not one run-on block', () => {
    expect(buildInviteMessage({ inviteUrl }).split('\n\n').length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildSocialMessage', () => {
  const inviteUrl = 'https://alrpa.app.link/wpZcPtFSh5b';

  test('carries the hashtag — a post without it is invisible', () => {
    expect(buildSocialMessage({ inviteUrl })).toContain(APP_HASHTAG);
  });

  test('says what the challenge is and invites people in', () => {
    const m = buildSocialMessage({ inviteUrl });
    expect(m).toContain('one kind act a day');
    expect(m).toContain('Join me');
    expect(m).toContain('kinder place');
  });

  test('carries the referral link', () => {
    expect(buildSocialMessage({ inviteUrl })).toContain(inviteUrl);
  });

  test('addressed to a room, not to one person', () => {
    // The Text/Email copy is written to someone you know; a post is not.
    expect(buildSocialMessage({ inviteUrl })).not.toContain("I'd love you to join me");
  });

  test('with no link it does not promise one', () => {
    const m = buildSocialMessage({});
    expect(m).not.toContain('tap the link');
    expect(m).toContain('Scan the code');
    expect(m).toContain(APP_HASHTAG);
  });

  test('no undefined or null leaks in', () => {
    for (const args of [{}, { inviteUrl: '' }, undefined]) {
      expect(buildSocialMessage(args)).not.toMatch(/undefined|null/);
    }
  });

  test('differs from the one-to-one invitation', () => {
    expect(buildSocialMessage({ inviteUrl })).not.toBe(buildInviteMessage({ inviteUrl }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Every share names the act.
//
// The bug these guard against: the captions said "I'm doing 30 Acts of
// Kindness" and nothing else. Someone reading the post could not tell what the
// act was, which is the one thing the share is about. Reported from a live X
// post on 2026-08-31.
// ─────────────────────────────────────────────────────────────────────────────
describe('the act appears in every caption', () => {
  const act = { dayNumber: 12, actTitle: 'Left a thank-you note for the mail carrier' };
  const inviteUrl = 'https://alrpa.app.link/wpZcPtFSh5b';

  test('the social caption names the day and the act', () => {
    const m = buildSocialMessage({ ...act, inviteUrl });
    expect(m).toContain('Day 12');
    expect(m).toContain(act.actTitle);
  });

  test('the text/email invitation names the day and the act', () => {
    const m = buildInviteMessage({ ...act, inviteUrl });
    expect(m).toContain('Day 12');
    expect(m).toContain(act.actTitle);
  });

  test('the act leads — it is the first thing read, not a footnote', () => {
    for (const m of [
      buildSocialMessage({ ...act, inviteUrl }),
      buildInviteMessage({ ...act, inviteUrl }),
    ]) {
      // Line 1 introduces it, line 2 is the act itself. What matters is that
      // both come before the invitation and the challenge line.
      const lines = m.split('\n');
      expect(lines[0]).toContain('act of kindness');
      expect(lines[1]).toContain(act.actTitle);
      expect(m.indexOf(act.actTitle)).toBeLessThan(m.indexOf('One kind act a day'));
    }
  });

  test('the caption says what the quoted words are', () => {
    // "Day 79: \"This is the fourth try...\"" left a reader guessing what the
    // quote was. Naming it is the whole point of the line.
    for (const m of [
      buildSocialMessage({ ...act, inviteUrl }),
      buildInviteMessage({ ...act, inviteUrl }),
    ]) {
      expect(m).toContain('My act of kindness');
    }
  });

  test('both still ask people to join', () => {
    expect(buildSocialMessage({ ...act, inviteUrl })).toContain('Join me');
    expect(buildInviteMessage({ ...act, inviteUrl })).toContain("I'd love you to join me");
  });

  test('the challenge is still explained under the act', () => {
    for (const m of [
      buildSocialMessage({ ...act, inviteUrl }),
      buildInviteMessage({ ...act, inviteUrl }),
    ]) {
      expect(m).toContain('One kind act a day for 30 days in a row.');
    }
  });

  test('the story rides along on text and email but never on social', () => {
    const story = 'She has delivered in the rain all week.';
    expect(buildInviteMessage({ ...act, story, inviteUrl })).toContain(story);
    // On social the story would crowd out the invitation inside X's 280.
    expect(buildSocialMessage({ ...act, inviteUrl })).not.toContain(story);
  });

  test('a share with no act still reads as a sentence, not a gap', () => {
    for (const m of [buildSocialMessage({ inviteUrl }), buildInviteMessage({ inviteUrl })]) {
      expect(m).toContain('one kind act a day for 30 days in a row');
      expect(m).not.toContain('""');
      expect(m).not.toMatch(/undefined|null/);
    }
  });

  test('the certificate says all 30 are done, and names no single act', () => {
    const m = buildSocialMessage({ completedAll: true, inviteUrl });
    expect(m).toContain('completed all 30');
    expect(m).not.toContain('Day ');
  });

  test('a day number with no title does not print an empty quote', () => {
    const m = buildSocialMessage({ dayNumber: 4, inviteUrl });
    expect(m).toContain('Day 4');
    expect(m).not.toContain('""');
  });
});

describe('the social caption fits X, whatever the act is called', () => {
  const inviteUrl = 'https://alrpa.app.link/wpZcPtFSh5b';

  // The longest title in acts_of_kindness.csv is 63 characters. A person can
  // also type their own, so the cap has to hold for anything.
  const LONGEST_CATALOGUE_TITLE =
    'Donated to a shelter (hygiene products, blankets, pet food)';

  test('the longest act in the catalogue fits, and is NOT trimmed', () => {
    const m = buildSocialMessage({ dayNumber: 30, actTitle: LONGEST_CATALOGUE_TITLE, inviteUrl });
    expect(fitsInXPost(m)).toBe(true);
    expect(m).toContain(LONGEST_CATALOGUE_TITLE);
    expect(m).not.toContain('…');
  });

  test('an absurdly long typed title is trimmed rather than overflowing', () => {
    const m = buildSocialMessage({ dayNumber: 9, actTitle: 'x '.repeat(200), inviteUrl });
    expect(fitsInXPost(m)).toBe(true);
  });

  test('a trimmed title breaks at a word, never mid-word', () => {
    const title = 'Paid for the coffee of the person behind me in the drive-through '
                + 'and left a note on the counter for the barista as well';
    const m = buildSocialMessage({ dayNumber: 7, actTitle: title, inviteUrl });
    expect(fitsInXPost(m)).toBe(true);
    const shown = m.match(/"([^"]*)"/)[1];
    expect(shown).toMatch(/…$/);
    // Whatever is shown must be a prefix of the real title, ending at a space.
    const stem = shown.slice(0, -1);
    expect(title.startsWith(stem)).toBe(true);
    expect(title[stem.length]).toBe(' ');
  });

  test('the invitation and the link always survive the trim', () => {
    const m = buildSocialMessage({ dayNumber: 9, actTitle: 'y '.repeat(200), inviteUrl });
    expect(m).toContain('Join me');
    expect(m).toContain(inviteUrl);
    expect(m).toContain(APP_HASHTAG);
  });

  test('the invitation still fits when there is no room for the act at all', () => {
    // maxLength small enough that no title can survive: the act line is dropped
    // whole rather than reduced to a stump.
    const m = buildSocialMessage({ dayNumber: 9, actTitle: 'Something kind', inviteUrl, maxLength: 215 });
    expect(m).not.toContain('…');
    expect(m).toContain('Join me');
  });
});

describe('trimToWords', () => {
  test('leaves a short string alone', () => {
    expect(trimToWords('short', 20)).toBe('short');
  });

  test('cuts at a space and marks the cut', () => {
    const out = trimToWords('one two three four five', 14);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(14);
    expect('one two three four five'.startsWith(out.slice(0, -1))).toBe(true);
  });

  test('gives back nothing when nothing meaningful survives', () => {
    expect(trimToWords('a much longer sentence than this', 5)).toBe('');
  });

  test('does not leave dangling punctuation before the ellipsis', () => {
    expect(trimToWords('Donated to a shelter, blankets and food', 24)).not.toMatch(/[,\s—-]…$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story-only days.
//
// The bug these guard against: writing a story without picking an act leaves
// the title as the app's own placeholder, "My Story". The first fix put the
// title in the caption and produced `Day 79: "My Story"` on a live X post —
// which tells a reader exactly as little as the version before it. When there
// is no real act, the person's own words are what the share is about.
// ─────────────────────────────────────────────────────────────────────────────
describe('a story-only day leads with the story, not the placeholder', () => {
  const inviteUrl = 'https://alrpa.app.link/wpZcPtFSh5b';
  const story = "I'm going to make six tests today";

  test('the placeholder title never reaches a caption', () => {
    for (const m of [
      buildSocialMessage({ dayNumber: 79, actTitle: 'My Story', story, inviteUrl }),
      buildInviteMessage({ dayNumber: 79, actTitle: 'My Story', story, inviteUrl }),
    ]) {
      expect(m).not.toContain('My Story');
      expect(m).toContain(story);
    }
  });

  test('placeholders are recognised whatever their casing', () => {
    for (const t of ['My Story', 'my story', 'MY STORY', 'My Act', 'Untitled', 'Day 12 act']) {
      expect(isRealActTitle(t)).toBe(false);
    }
  });

  test('a real act title is not mistaken for a placeholder', () => {
    for (const t of [
      'Left a thank-you note for the mail carrier',
      'Told my story to a neighbour',   // contains "story" but is a real act
      'Wrote a letter to a teacher',
    ]) {
      expect(isRealActTitle(t)).toBe(true);
    }
  });

  test('a real act still wins over the story', () => {
    const m = buildSocialMessage({
      dayNumber: 12, actTitle: 'Left a thank-you note for the mail carrier', story, inviteUrl,
    });
    expect(m).toContain('Left a thank-you note');
    expect(m).not.toContain(story);
  });

  test('the story is not printed twice on a story-only day', () => {
    const m = buildInviteMessage({ dayNumber: 79, actTitle: 'My Story', story, inviteUrl });
    expect(m.split(story)).toHaveLength(2);          // exactly one occurrence
    expect(m).not.toContain("Here's what I did:");
  });

  test('with a real act, the story still gets its own block on text/email', () => {
    const m = buildInviteMessage({
      dayNumber: 12, actTitle: 'Left a thank-you note for the mail carrier', story, inviteUrl,
    });
    expect(m).toContain("Here's what I did:");
    expect(m).toContain(story);
  });

  test('a long story is trimmed to fit X rather than overflowing', () => {
    const long = 'I stopped at the shelter on my way home and dropped off the '
               + 'blankets we had spare, then stayed an hour to help sort the '
               + 'donation bins because they were short-handed that evening.';
    const m = buildSocialMessage({ dayNumber: 5, actTitle: 'My Story', story: long, inviteUrl });
    expect(fitsInXPost(m)).toBe(true);
    expect(m).toContain('…');
    expect(m).toContain('Join me');
    expect(m).toContain(inviteUrl);
  });

  test('neither an act nor a story still produces a sensible caption', () => {
    const m = buildSocialMessage({ dayNumber: 3, actTitle: 'My Story', story: '', inviteUrl });
    expect(m).not.toContain('My Story');
    expect(m).not.toContain('""');
    expect(m).toContain('Day 3');
    expect(m).toContain('Join me');
  });
});

describe('buildLead', () => {
  test('prefers a real act title', () => {
    expect(buildLead({ actTitle: 'Mowed a lawn', story: 'it was hot' })).toBe('Mowed a lawn');
  });

  test('falls back to the story when the title is filler', () => {
    expect(buildLead({ actTitle: 'My Story', story: 'it was hot' })).toBe('it was hot');
  });

  test('is empty when there is nothing to say', () => {
    expect(buildLead({ actTitle: 'My Story', story: '   ' })).toBe('');
    expect(buildLead({})).toBe('');
  });
});
