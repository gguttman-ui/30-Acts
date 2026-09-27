// Item 17c (27 Sep 2026): privacy text and the account-deleted goodbye.
// The wording was approved by Gary on 27 Sep and checked against
// delete_my_account() on production the same day.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const LEGAL    = read('src', 'screens', 'LegalScreen.js');
const SITE     = read('website', 'privacy.html');
const GOODBYE  = read('src', 'screens', 'GoodbyeScreen.js');
const NAV      = read('src', 'navigation', 'index.js');
const SETTINGS = read('src', 'screens', 'SettingsScreen.js');
const APP      = read('App.js');

describe('privacy policy, app and website say the same thing', () => {
  for (const [name, text] of [['app', LEGAL], ['website', SITE]]) {
    describe(name, () => {
      test('effective 1 October 2026', () => expect(text).toContain('October 1, 2026'));
      test('2.7 explains shipping addresses and deletion', () => {
        expect(text).toContain('we delete the address 30 days after the order ships');
        expect(text).toContain('what you wrote about your acts');
        expect(text).toContain('so the people who invited you keep their counts');
        expect(text).toContain('Picture cards of acts you shared by email may remain');
      });
      test('2.9 points to self-service deletion', () =>
        expect(text).toMatch(/Settings (>|&gt;) Delete My Account/));
      test('2.5 names Zelle', () => expect(text).toContain('Zelle'));
    });
  }

  test('Venmo is in the website 2.5 only - it refuses payments from inside the app', () => {
    const app25 = LEGAL.slice(LEGAL.indexOf("heading: '2.5 Sharing"), LEGAL.indexOf("heading: '2.6 Public"));
    expect(app25).toContain('PayPal and Zelle');
    expect(app25).not.toContain('Venmo');
    expect(SITE).toContain('PayPal, Venmo, and Zelle');
  });

  test('the website no longer claims email, password or photo collection', () => {
    expect(SITE).not.toContain('Password or login credentials');
    expect(SITE).not.toContain('Uploaded photos, videos');
    expect(SITE).toContain('We do not collect or store a password');
  });

  test('only the privacy policy moved its date; other legal docs keep theirs', () => {
    expect(LEGAL).toContain("effective: 'October 1, 2026'");
    expect(LEGAL).toContain("doc.effective || 'April 2026'");
  });
});

describe('after Delete My Account', () => {
  test('Settings reports a deletion, not a logout', () => {
    expect(SETTINGS).toContain("navigate('deleted')");
  });
  test('the navigator passes the reason through', () => {
    expect(NAV).toContain("if (dest === 'deleted') onLogout('deleted');");
  });
  test('App forgets the phone and biometric unlock, and shows the deleted goodbye', () => {
    expect(APP).toMatch(/reason === 'deleted'/);
    expect(APP).toContain("multiRemove(['remembered_phone', 'biometric_enabled'])");
    expect(APP).toContain("deleted={goodbye === 'deleted'}");
    expect(APP).toContain("goodbye === 'deleted' ? handleHardLogout : handleWelcomeBack");
  });
  test('the goodbye says the account is deleted, not "see you next time"', () => {
    expect(GOODBYE).toContain('Your account has been deleted');
    expect(GOODBYE).toContain('label="Done"');
  });
});
