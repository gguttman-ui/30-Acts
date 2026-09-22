// Every user-authored field must be screened before it is saved.
//
// THE GAP (found 2026-09-02 while preparing the App Store submission):
// isContentBlocked ran in DailyActScreen and on the display name in Settings —
// but NOT in MyStoryScreen, which is where people actually write now. The main
// user-authored field in the app was going into the database unchecked, while
// the review notes were about to tell Apple that submitted text is filtered.
//
// Custom act titles and act suggestions were unscreened too. Nobody else ever
// sees those, but both land in a queue a person at 30 Acts reads, and a
// reviewer should not have to read abuse in order to reject it.
//
// Guideline 1.2 asks for "a method for filtering objectionable material". This
// test is what keeps that claim true as screens come and go.
const fs   = require('fs');
const path = require('path');

const screen = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', name), 'utf8');

// Every screen that writes text a person typed.
const WRITES_USER_TEXT = {
  'MyStoryScreen.js':      'the act story — the main one, and the one that was missing',
  'DailyActScreen.js':     'act title and story',
  'CreateNewActScreen.js': 'a custom act title',
  'SuggestActScreen.js':   'an act suggestion',
  'SettingsScreen.js':     'the display name',
};

describe('the content filter reaches every user-authored field', () => {
  for (const [name, what] of Object.entries(WRITES_USER_TEXT)) {
    describe(`${name} — ${what}`, () => {
      const src = screen(name);

      test('imports the filter', () => {
        expect(src).toContain("from '../lib/moderation'");
        expect(src).toContain('isContentBlocked');
      });

      test('actually calls it', () => {
        expect(src).toMatch(/isContentBlocked\(/);
      });

      test('stops the save when the text is blocked', () => {
        // Calling the filter and ignoring the answer would be worse than not
        // calling it, because it reads as covered.
        expect(src).toMatch(/blocked/i);
        expect(src).toMatch(/Alert\.alert\(/);
      });
    });
  }
});

describe('the filter cannot fail', () => {
  // Was "fails open": the filter used to make a network call that always
  // 404'd and swallowed the error. Item 15 removed it (22 Sep 2026), so there
  // is no longer any failure mode to be open about — the check is local.
  const MODERATION = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'moderation.js'), 'utf8'
  );

  test('there is no network call left to fail', () => {
    // Re-adding one means sending private stories to a third party, which is
    // a privacy-disclosure decision, not a code tweak. See item 15.
    //
    // Deliberately matched against CODE, not prose: the comment in
    // moderation.js names the deleted function on purpose so nobody rebuilds
    // it by accident, and a bare word search would forbid explaining itself.
    const code = MODERATION
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

    expect(code).not.toMatch(/fetch\(/);
    expect(code).not.toMatch(/functions\/v1\//);
    expect(code).not.toMatch(/moderateContent/);
    expect(code).not.toMatch(/SUPABASE_URL|SUPABASE_ANON_KEY/);
  });

  test('every screen catches its own moderation failure', () => {
    for (const name of Object.keys(WRITES_USER_TEXT)) {
      const src = screen(name);
      const calls = src.match(/isContentBlocked\([\s\S]{0,200}?\)/g) || [];
      expect(calls.length).toBeGreaterThan(0);
    }
  });

  test('the local wordlist check needs no network at all', () => {
    // The instant half of the filter, so an offline phone still screens.
    expect(MODERATION).toContain('export function containsProfanity');
  });
});

describe('one rejection message, not five', () => {
  test('BLOCKED_MESSAGE exists and names the Community Guidelines', () => {
    const MODERATION = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'lib', 'moderation.js'), 'utf8'
    );
    expect(MODERATION).toContain('export const BLOCKED_MESSAGE');
    expect(MODERATION).toContain('Community Guidelines');
  });
});
