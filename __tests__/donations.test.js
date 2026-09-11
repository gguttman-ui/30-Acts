// Donation links.
//
// THE MONEY THIS PROTECTS: the PayPal link used to be a managed QR-code link,
// which charges a transaction fee on every gift. It was replaced on 2026-08-31
// with the PayPal Giving Fund charity page, where PayPal takes nothing. The two
// URLs look equally plausible in a diff and behave identically when tapped —
// the only visible difference is on the statement weeks later. Hence a test.
//
// src/constants/index.js require()s PNG assets, so it cannot be imported by a
// plain Node test runner. Reading the source is the portable way to assert on
// it, and it is the value in the file that ships either way.
const fs   = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'constants', 'index.js'), 'utf8'
);

// Comments in that file deliberately name the old fee-charging URL as a warning
// not to go back to it. Strip them, or the warning would trip the check it
// exists to support.
const CONSTANTS = SOURCE.replace(/^\s*\/\/.*$/gm, '');

// The PayPal entry's url line, whatever it currently says.
const paypalUrl = () => {
  const block = CONSTANTS.match(/id:\s*'paypal'[\s\S]*?\n\s*\},/);
  if (!block) return null;
  const m = block[0].match(/^\s*url:\s*'([^']+)'/m);
  return m ? m[1] : null;
};

describe('the PayPal donation link', () => {
  test('the warning comment naming the old link is still there', () => {
    // It is the only thing telling the next person why not to change this back.
    expect(SOURCE).toContain('qrcodes/managed');
  });

  test('is present at all', () => {
    // Guards the assertions below against passing vacuously if the entry is
    // renamed or restructured.
    expect(paypalUrl()).toBeTruthy();
  });

  test('is the fee-free Giving Fund charity page', () => {
    expect(paypalUrl()).toBe('https://www.paypal.com/us/fundraiser/charity/5977398');
  });

  test('is NOT a managed QR-code link — those charge a fee on every donation', () => {
    expect(paypalUrl()).not.toContain('/qrcodes/managed/');
  });

  test('no managed QR-code link survives anywhere in the constants', () => {
    // Belt and braces: the bracelet screen reads d.url from this same config,
    // so one stale copy would quietly reintroduce the fee. Comments are
    // excluded — the file names the old URL on purpose, to warn people off it.
    expect(CONSTANTS).not.toContain('paypal.com/qrcodes/managed');
  });

  test('is https, so no donor is sent over plain http', () => {
    expect(paypalUrl()).toMatch(/^https:\/\//);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Venmo.
//
// THE BUG: the app opened venmo://paycharge?txn=pay&recipients=... with the
// amount and note pre-filled. paycharge is Venmo's PERSON-TO-PERSON rail, and
// a charity profile refuses a P2P payment — the sheet resolves the charity by
// name and then fails with "You can't donate to this charity right now."
//
// It cost weeks, because it looks exactly like an account problem. It is not:
// donating to the same charity from inside the Venmo app worked the whole
// time. Proven on device 2026-09-02 by changing the funding source, the
// amount, and the originating screen and getting an identical failure each
// time.
//
// The pre-filled amount is what made paycharge tempting. It is worth nothing
// on a payment that cannot complete.
// ─────────────────────────────────────────────────────────────────────────────
describe('Venmo is hidden for launch', () => {
  test('the Venmo entry exists but is not offered', () => {
    // Kept, with its notes, so bringing it back is deleting one line.
    expect(CONSTANTS).toContain("id: 'venmo'");
    const block = CONSTANTS.match(/id:\s*'venmo'[\s\S]*?\n\s*\},/);
    expect(block[0]).toContain('hidden: true');
  });

  test('screens read the FILTERED list, so hiding one actually hides it', () => {
    expect(CONSTANTS).toMatch(/const ALL_DONATIONS = \[/);
    expect(CONSTANTS).toMatch(
      /export const DONATIONS = ALL_DONATIONS\.filter\(\(d\) => !d\.hidden\)/
    );
  });

  test('nothing imports the unfiltered list', () => {
    // ALL_DONATIONS is deliberately not exported; a screen reaching for it
    // would put the broken button straight back on the page.
    expect(CONSTANTS).not.toMatch(/export const ALL_DONATIONS/);
  });

  test('PayPal and Zelle survive the filter', () => {
    const paypal = CONSTANTS.match(/id:\s*'paypal'[\s\S]*?\n\s*\},/);
    const zelle  = CONSTANTS.match(/id:\s*'zelle'[\s\S]*?\n\s*\},/);
    expect(paypal[0]).not.toContain('hidden');
    expect(zelle[0]).not.toContain('hidden');
  });
});

describe('the Venmo donation link', () => {
  const venmoBlock = () => {
    const m = CONSTANTS.match(/id:\s*'venmo'[\s\S]*?\n\s*\},/);
    return m ? m[0] : null;
  };

  test('the Venmo entry is present at all', () => {
    expect(venmoBlock()).toBeTruthy();
  });

  test('does NOT use paycharge — a charity profile refuses that rail', () => {
    expect(CONSTANTS).not.toContain('paycharge');
  });

  test('nothing builds a paycharge URL by hand either', () => {
    // The bracelet screen used to assemble one from a `handle` field.
    const braceletSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'screens', 'BraceletPaymentScreen.js'), 'utf8'
    );
    // Comments there name paycharge on purpose, to warn the next person off it.
    const bracelet = braceletSource.replace(/^\s*\/\/.*$/gm, '');
    expect(bracelet).not.toContain('paycharge');
    expect(bracelet).not.toContain('txn=pay');
    // ...and the warning itself must survive.
    expect(braceletSource).toContain('paycharge');
  });

  test('opens the charity profile, where the Donate button lives', () => {
    expect(venmoBlock()).toContain("deepLink: 'venmo://users/Actsofkindness30'");
  });

  test('falls back to the web profile for a phone without the app', () => {
    expect(venmoBlock()).toContain("url: 'https://venmo.com/u/Actsofkindness30'");
  });

  test('the handle field is gone — it was what built the bad URL', () => {
    expect(venmoBlock()).not.toMatch(/^\s*handle:/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Donation screen copy.
//
// WHAT THIS PROTECTS: App Review rejected 1.0 build 97 on 2026-09-09 under
// guideline 3.1.1 because the hero subtitle said donations help "keep this app
// free for everyone". The reviewer read that as funding app development, which
// would require In-App Purchase.
//
// Donations go to a 501(c)(3) and are collected outside the app, which is
// allowed by guideline 3.2.2(iv) — but only while the copy says so. One
// well-meaning marketing edit ("helps us keep the lights on", "supports the
// app") puts the rejection straight back. Hence a test on the words.
// ─────────────────────────────────────────────────────────────────────────────
describe('the donation screen copy', () => {
  const SCREEN_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'DonationScreen.js'), 'utf8'
  );

  // The file quotes the rejected sentence in a comment on purpose, as the
  // warning to the next person. Strip comments or that warning trips the check
  // it exists to support.
  const SCREEN = SCREEN_SOURCE.replace(/^\s*\/\/.*$/gm, '');

  test('the warning naming the rejected wording is still there', () => {
    // It is the only thing telling the next person why this copy is the way it
    // is. Losing it is how the phrase comes back.
    expect(SCREEN_SOURCE).toContain('keep this app');
    expect(SCREEN_SOURCE).toContain('3.1.1');
  });

  test('no user-facing string says donations keep the app free', () => {
    expect(SCREEN).not.toMatch(/keep this app free/i);
    expect(SCREEN).not.toMatch(/free for everyone/i);
  });

  test('no user-facing string ties a gift to the app or its development', () => {
    // Catches the obvious rewrites of the same idea.
    expect(SCREEN).not.toMatch(/support(s|ing)?\s+(this\s+|the\s+)?app\b/i);
    expect(SCREEN).not.toMatch(/fund(s|ing)?\s+(this\s+|the\s+)?app\b/i);
    expect(SCREEN).not.toMatch(/app\s+development/i);
    expect(SCREEN).not.toMatch(/keep the lights on/i);
    expect(SCREEN).not.toMatch(/server costs?/i);
  });

  test('the copy names the nonprofit as what the gift supports', () => {
    // The hero says the gift supports the nonprofit's mission. If that framing
    // is ever dropped, the screen is back to saying nothing about where the
    // money goes — which is what invited the reviewer's own reading.
    expect(SCREEN).toMatch(/charitable mission of our 501\(c\)\(3\)/);
  });

  test('the 501(c)(3) status and EIN stay on the screen', () => {
    // Load-bearing for the guideline 3.2.2(iv) argument, and for donors.
    expect(SCREEN).toContain('501(c)(3)');
    expect(SCREEN).toContain('41-4058016');
  });

  test('no payment is taken in the app — every method opens out or copies', () => {
    // A donate button that charged in-app would be a real 3.1.1 violation
    // rather than a misread one.
    expect(SCREEN).not.toMatch(/expo-in-app-purchases|react-native-iap|StoreKit/);
  });
});
