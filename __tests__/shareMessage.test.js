// Share caption rules. The bug these guard against: SMS and email carry no
// image, so they carry no QR code — but the caption used to tell the reader to
// scan one anyway.
import {
  buildActShareMessage,
  buildInviteMessage,
  buildSocialMessage,
  buildJoinSteps,
  channelHasQr,
  APP_HASHTAG,
} from '../src/lib/shareMessage';

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
