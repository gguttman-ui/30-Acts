// David's UX fix 6 (18 Nov 2026): Me is one short page of grouped rows, and
// Help and Feedback moved out of the tab bar into it.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');

const ME  = read('src', 'screens', 'SettingsScreen.js');
const NAV = read('src', 'navigation', 'index.js');

describe('Me grouped list', () => {
  test('titled "Me", not "Settings"', () => {
    expect(ME).toContain('<ScreenHeader title="Me" />');
    expect(ME).not.toContain('title="Settings"');
  });

  test('the four groups, in order', () => {
    const order = ['REMINDERS', 'COMMUNITY', 'HELP AND FEEDBACK', 'ACCOUNT']
      .map((g) => ME.indexOf(`>${g}<`));
    order.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('header shows the day and the all-time count', () => {
    expect(ME).toMatch(/`Day \$\{completedCount\} of 30 · \$\{lifetime == null \? '…' : lifetime\} acts all-time`/);
  });

  test('one reminder switch, and no separate ON/OFF chip', () => {
    expect(ME).toMatch(/onValueChange=\{onReminderSwitch\}/);
    expect(ME).not.toMatch(/toggleReminder\('first'/);
    expect(ME).not.toContain('\\u25CF  ON');
  });

  test('consent wording only in the turn-on box, and Yes saves', () => {
    expect(ME.split('{SMS_CONSENT_TEXT}').length - 1).toBe(1);
    expect(ME).toMatch(/if \(next\) setShowConsent\(true\);/);
    expect(ME).toMatch(/const acceptConsent = \(\) => \{\s*setShowConsent\(false\);\s*toggleReminder\('master', true\);/);
  });

  test('mailing address is gone from the profile (ZIP stays for the time zone)', () => {
    expect(ME).not.toContain('MAILING ADDRESS');
    expect(ME).not.toContain('label="Street Address"');
    expect(ME).toContain('ZIP Code (sets your time zone)');
    // saved addresses are kept, not wiped, on the next save
    expect(ME).toMatch(/street1:\s+street1\.trim\(\) \|\| null/);
  });

  test("Go to Today's Act and Search my acts are off Me", () => {
    expect(ME).not.toContain("Go to Today's Act");
    expect(ME).not.toContain('Search my acts');
  });

  test('red actions ask first', () => {
    expect(ME).toMatch(/label="Start over at Day 1" danger onPress=\{handleRestart\}/);
    expect(ME).toMatch(/label="Delete My Account" danger onPress=\{\(\) => setShowDeleteConfirm\(true\)\}/);
    expect(ME).toMatch(/label="Log out" onPress=\{confirmLogout\}/);
  });

  test('Help and Feedback are no longer tabs, but still reachable', () => {
    expect(NAV).not.toMatch(/<Tab\.Screen name="Feedback"/);
    expect(NAV).not.toMatch(/<Tab\.Screen name="Help"/);
    expect(NAV).toMatch(/<Stack\.Screen name="Feedback"\s+component=\{FeedbackScreen\}/);
    expect(NAV).toMatch(/<Stack\.Screen name="Help">/);
    expect(ME).toContain("navigation.navigate('Feedback')");
    expect(ME).toContain("navigation.navigate('Help')");
    expect(ME).toContain("navigation.navigate('Tour')");
    expect(ME).toContain('reportProblem(user)');
    expect(ME).toContain("navigation.navigate('Donation')");
  });
});
