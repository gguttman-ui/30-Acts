// X composer intent URLs.
//
// The bug these guard against: X was opened through the iOS share sheet, which
// carries the picture beautifully but buries X behind a swipe of the app row on
// phones where iOS has not promoted it. The composer intent opens X directly
// instead — so these URLs are now the only thing standing between the button
// and a post.
import {
  buildXIntentUrls,
  xPostLength,
  fitsInXPost,
  X_MAX_CHARS,
  X_LINK_WEIGHT,
  buildXShareAlert,
} from '../src/lib/xIntent';
import { buildSocialMessage } from '../src/lib/shareMessage';

const inviteUrl = 'https://alrpa.app.link/wpZcPtFSh5b';

describe('buildXIntentUrls', () => {
  test('the app URL opens the composer, not a profile or a search', () => {
    const { appUrl } = buildXIntentUrls({ caption: 'hello' });
    expect(appUrl).toMatch(/^twitter:\/\/post\?message=/);
  });

  test('the web URL is a real universal link to the composer', () => {
    const { webUrl } = buildXIntentUrls({ caption: 'hello' });
    expect(webUrl).toMatch(/^https:\/\/x\.com\/intent\/post\?text=/);
  });

  test('the caption is URL-encoded — newlines and # survive the trip', () => {
    // An unencoded '#' truncates a URL at the fragment, which would silently
    // drop the hashtag and everything after it.
    const caption = 'line one\nline two #30ActsOfKindness';
    const { appUrl, webUrl } = buildXIntentUrls({ caption });
    for (const url of [appUrl, webUrl]) {
      expect(url).not.toContain('\n');
      expect(url).not.toContain(' ');
      expect(url).toContain('%23');       // #
      expect(url).toContain('%0A');       // newline
      expect(decodeURIComponent(url.split('=')[1])).toBe(caption);
    }
  });

  test('an ampersand in the caption cannot spawn a second query parameter', () => {
    const { appUrl } = buildXIntentUrls({ caption: 'kind & true' });
    expect(appUrl).toContain('%26');
    expect(appUrl.split('?')[1].split('&')).toHaveLength(1);
  });

  test('the real caption round-trips exactly', () => {
    const caption = buildSocialMessage({ inviteUrl });
    const { webUrl } = buildXIntentUrls({ caption });
    const sent = decodeURIComponent(webUrl.split('text=')[1]);
    expect(sent).toBe(caption);
  });

  test('no caption still yields usable URLs rather than "undefined"', () => {
    for (const args of [{}, { caption: '' }, undefined]) {
      const { appUrl, webUrl } = buildXIntentUrls(args);
      expect(appUrl).not.toMatch(/undefined|null/);
      expect(webUrl).not.toMatch(/undefined|null/);
    }
  });
});

describe('xPostLength', () => {
  test('plain text counts as itself', () => {
    expect(xPostLength('hello')).toBe(5);
    expect(xPostLength('')).toBe(0);
  });

  test('a link counts as 23 however long it is — that is how X counts', () => {
    expect(xPostLength('https://x.com')).toBe(X_LINK_WEIGHT);
    const long = 'https://example.com/' + 'a'.repeat(300);
    expect(xPostLength(long)).toBe(X_LINK_WEIGHT);
  });

  test('text and a link together', () => {
    expect(xPostLength(`hi ${inviteUrl}`)).toBe(3 + X_LINK_WEIGHT);
  });

  test('handles a caption with no link at all', () => {
    const caption = buildSocialMessage({});
    expect(xPostLength(caption)).toBe(caption.length);
  });
});

describe('the caption actually fits X', () => {
  // This is the test that earns its keep. The share copy gets edited; X's limit
  // does not move. An over-limit caption opens the composer with a red counter
  // and a disabled Post button, which reads as "the app is broken".
  test('with a referral link', () => {
    const caption = buildSocialMessage({ inviteUrl });
    expect(xPostLength(caption)).toBeLessThanOrEqual(X_MAX_CHARS);
    expect(fitsInXPost(caption)).toBe(true);
  });

  test('without a referral link', () => {
    expect(fitsInXPost(buildSocialMessage({}))).toBe(true);
  });

  test('leaves room to spare, so a small copy edit does not break it', () => {
    const used = xPostLength(buildSocialMessage({ inviteUrl }));
    expect(X_MAX_CHARS - used).toBeGreaterThan(30);
  });
});

describe('buildXShareAlert', () => {
  test('the clipboard route tells you to paste, and does not mention hunting Photos first', () => {
    const m = buildXShareAlert({ imageOnClipboard: true, savedToPhotos: true });
    expect(m).toContain('Paste');
    expect(m.indexOf('Paste')).toBeLessThan(m.indexOf('Photos'));
  });

  test('the Photos route tells you to tap the photo icon', () => {
    const m = buildXShareAlert({ imageOnClipboard: false, savedToPhotos: true });
    expect(m).toContain('photo icon');
    expect(m).not.toContain('Paste');
  });

  test('every route says the caption is already written', () => {
    for (const args of [
      { imageOnClipboard: true, savedToPhotos: true },
      { imageOnClipboard: true, savedToPhotos: false },
      { imageOnClipboard: false, savedToPhotos: true },
      {},
      undefined,
    ]) {
      expect(buildXShareAlert(args)).toContain('caption already written');
    }
  });

  test('when nothing worked it says so rather than giving a false instruction', () => {
    const m = buildXShareAlert({});
    expect(m).not.toContain('Paste');
    expect(m).not.toContain('photo icon');
    expect(m).toContain('could not be prepared');
  });

  test('no undefined or null leaks into what the person reads', () => {
    for (const args of [{}, undefined, { imageOnClipboard: true }]) {
      expect(buildXShareAlert(args)).not.toMatch(/undefined|null/);
    }
  });
});
