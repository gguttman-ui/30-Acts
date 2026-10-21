import { buildEmailSubject, buildInviteMessage } from '../src/lib/shareMessage';

// Gary, 21 Oct 2026 (staging test): the email subject is the act -
// "My act of kindness for Day 2: ..." - and the body does not repeat it.

const ACT = 'Adopted a section of road or trail to keep clean';

describe('email subject and body', () => {
  test('subject names the day and the act', () => {
    expect(buildEmailSubject({ dayNumber: 2, actTitle: ACT })).toBe(`My act of kindness for Day 2: "${ACT}"`);
  });

  test('a story-only act uses the story', () => {
    expect(buildEmailSubject({ dayNumber: 5, actTitle: 'My Story', story: 'Paid for coffee' }))
      .toBe('My act of kindness for Day 5: "Paid for coffee"');
  });

  test('a long story is cut at a word, not mid-word', () => {
    const story = 'I spent the afternoon helping my neighbour carry boxes up three flights of stairs because her elevator broke';
    const s = buildEmailSubject({ dayNumber: 3, actTitle: 'My Story', story });
    expect(s.length).toBeLessThan(120);
    expect(s).toMatch(/…"$/);
  });

  test('email body does not repeat the act; the text body still does', () => {
    const email = buildInviteMessage({ dayNumber: 2, actTitle: ACT, story: ACT, inviteUrl: 'https://x.y', forEmail: true });
    expect(email).not.toContain(ACT);
    expect(email).toContain('One kind act a day for 30 days in a row.');
    const text = buildInviteMessage({ dayNumber: 2, actTitle: ACT, story: ACT, inviteUrl: 'https://x.y' });
    expect(text).toContain(ACT);
  });
});

describe('the email card is attached, not a web image', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/MyStoryScreen.js'), 'utf8');
  const email = src.slice(src.indexOf('const handleShareEmail'), src.indexOf('// 2. Share sheet, card attached.'));

  test('Mail gets the card as an attachment', () => {
    expect(email).toMatch(/attachments: \[uri\]/);
  });

  test('no upload and no HTML image (Gmail showed only the alt text)', () => {
    expect(email).not.toMatch(/uploadShareCard\(/);
    expect(email).not.toMatch(/buildShareEmailHtml\(/);
  });

  test('subject is the act, body does not repeat it', () => {
    expect(email).toMatch(/subject: subjectText/);
    expect(email).toMatch(/body: emailCaption\(\)/);
  });
});
