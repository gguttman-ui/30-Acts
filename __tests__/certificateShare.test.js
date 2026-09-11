// The certificate's Text and Email routes.
//
// THE BUG: both were one-liners calling shareCertImage, which opened the
// generic iOS share sheet. Text was fine that way — the sheet hands Messages
// the certificate. Email was not: it opened the same generic sheet with a
// subject bolted on, so it never reached Mail and the certificate never
// rendered inside a message the way it does on the other three screens.
// Gary hit this on 2026-09-01 after completing a real 30 days.
//
// The certificate screen is the odd one out — no single act to name, a
// different capture, its own handlers — which is exactly why it drifted from
// the other three and why nobody noticed until someone finished 30 days. These
// assertions are on the source because the handlers are all I/O.
const fs   = require('fs');
const path = require('path');

const read = (f) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', f), 'utf8');

const CERT     = read('CertificateScreen.js');
const MY_STORY = read('MyStoryScreen.js');

describe('the certificate Email route reaches Mail, not a generic sheet', () => {
  test('it is no longer the one-line call that caused the bug', () => {
    expect(CERT).not.toContain("handleShareEmail = () => shareCertImage(");
  });

  test('it uses the Mail composer', () => {
    expect(CERT).toContain("require('expo-mail-composer')");
    expect(CERT).toContain('composeAsync(');
  });

  test('it hosts the certificate so it renders inline', () => {
    // An <img> needs a real URL; email clients strip data: URIs.
    expect(CERT).toContain('uploadShareCard(');
    expect(CERT).toContain('buildShareEmailHtml(');
    expect(CERT).toContain('isHtml: true');
  });

  test('it still has a plain mailto: fallback for a phone with no Mail app', () => {
    expect(CERT).toContain('mailto:?subject=');
    expect(CERT).toContain('No email app set up');
  });

  test('the same three-step ladder as MyStoryScreen', () => {
    // Whatever the certificate does, it must not be a different shape from the
    // screen it is supposed to match — that difference IS this bug.
    for (const marker of [
      "require('expo-mail-composer')",
      'composeAsync(',
      'uploadShareCard(',
      'buildShareEmailHtml(',
      'mailto:?subject=',
    ]) {
      expect(MY_STORY).toContain(marker);
      expect(CERT).toContain(marker);
    }
  });
});

describe('the certificate upload matches what the bucket stores', () => {
  test('the emailed capture is a JPEG', () => {
    // uploadShareCard writes contentType image/jpeg with a .jpg path. The
    // certificate is otherwise captured as PNG, which is sharper for a page of
    // text — so the email path captures its own JPEG rather than mislabelling
    // a PNG and hoping the client sniffs it.
    expect(CERT).toContain("format: 'jpg'");
    expect(CERT).toContain('certJpegUri');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No share button may be left dead to taps.
//
// Every share handler does `if (sharing) return; setSharing(true)` and clears
// the flag in a finally. If an await never settles the finally never runs, the
// flag stays true, and every share button on that screen silently ignores taps
// with nothing on screen to explain it. The person reports "sharing stopped
// working" — indistinguishable from a dozen other faults.
//
// It has happened twice. This test is why it should not happen a third time.
// ─────────────────────────────────────────────────────────────────────────────
const SCREENS = {
  'MyStoryScreen.js':     MY_STORY,
  'DailyActScreen.js':    read('DailyActScreen.js'),
  'HistoryScreen.js':     read('HistoryScreen.js'),
  'CertificateScreen.js': CERT,
};

describe('no share button can be left dead to taps', () => {
  for (const [name, src] of Object.entries(SCREENS)) {
    describe(name, () => {
      test('has no unbounded RNShare.open', () => {
        expect(src).not.toMatch(/await\s+RNShare\.open\(/);
      });

      test('wraps every share sheet in the shared timeout', () => {
        // Guards the assertion above from passing merely because the calls were
        // deleted: there must be at least one, and it must be wrapped.
        const opens = (src.match(/RNShare\.open\(/g) || []).length;
        expect(opens).toBeGreaterThan(0);
        const wrapped = (src.match(/withTimeout\(\s*RNShare\.open\(/g) || []).length;
        expect(wrapped).toBe(opens);
      });

      test('uses the one shared helper, not a private copy', () => {
        // Four screens had grown three copies under two names with different
        // signatures. That is how they drift apart.
        expect(src).toContain("from '../lib/withTimeout'");
        expect(src).not.toMatch(/const cap(ped)? = \(promise/);
        expect(src).not.toMatch(/^function withTimeout\(/m);
      });

      test('uses the named limits, not bare numbers', () => {
        expect(src).toContain('SHARE_SHEET_TIMEOUT_MS');
      });
    });
  }

  test('a swallowed share failure is never mistaken for success', () => {
    // The subtle one. Callers decide whether to fall back by reading
    // res?.success !== false. A catch returning null makes a TIMEOUT look like
    // a successful share, so the SMS or mailto fallback is skipped and the
    // person is left with nothing sent and no error.
    for (const [name, src] of Object.entries(SCREENS)) {
      const inspected = src.match(/const res = await withTimeout\(([\s\S]*?)\n\s*\}\);/g) || [];
      for (const block of inspected) {
        expect(block).toContain('success: false');
        expect(block).not.toMatch(/return null;/);
      }
    }
  });
});
