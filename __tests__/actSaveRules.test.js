// 19-21 Oct 2026 fixes, guarded at the source so they cannot quietly come back.
//
//   82  The profile is written right after sign-up, before the reminder step
//       (Kathryn Fisher left at that step and had an account but no profile).
//   83  An empty yesterday can always be added; day numbers come from the dates.
//   85  A completed act is looked up by id or calendar date, never day_number
//       (David's 19 and 20 Oct acts opened with no text).
//   --  Acts are dated where the person physically is - the phone's date - not
//       the profile's home time zone (David, home Arizona, in New York).

const fs   = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
// Code only - comments may mention the old ways.
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SCREENS = [
  'src/screens/MyStoryScreen.js',
  'src/screens/DailyActScreen.js',
  'src/screens/HistoryScreen.js',
];

describe('backlog 85 - completed acts are never looked up by day_number', () => {
  test.each(SCREENS)('%s has no day_number lookup', (rel) => {
    expect(code(rel)).not.toMatch(/\.eq\(\s*'day_number'\s*,\s*day(Obj)?\??\.dayNumber/);
  });
});

describe('acts are dated where the person is (phone date, not home time zone)', () => {
  test.each(['src/screens/MyStoryScreen.js', 'src/screens/DailyActScreen.js'])(
    '%s saves under the tapped date', (rel) => {
      const src = code(rel);
      expect(src).not.toMatch(/localDateValue\s*=\s*localDateInTZ/);
      expect(src).toMatch(/const localDateValue = (targetDay|day)\.scheduledDate;/);
    });
});

describe('backlog 83 - day numbers and yesterday', () => {
  test('MyStory stores the day number worked out from the dates', () => {
    const src = code('src/screens/MyStoryScreen.js');
    expect(src).toMatch(/streakDayNumbers\(/);
    expect(src).toMatch(/day_number:\s*dayNumberValue/);
    expect(src).not.toMatch(/day_number:\s*targetDay\.dayNumber/);
  });

  test('the dashboard offers an empty yesterday', () => {
    const src = code('src/screens/DashboardView.js');
    expect(src).toMatch(/yesterdayOpen/);
    expect(src).toMatch(/cell\.type === 'yesterday'/);
    expect(src).toMatch(/startNewAct\(yesterday\)/);
  });
});

describe('backlog 82 - profile written at sign-up', () => {
  test('handleSignupSend upserts the profile before the reminder step', () => {
    const src = code('src/screens/AuthScreen.js');
    const start = src.indexOf('const handleSignupSend');
    const body  = src.slice(start, src.indexOf('const handleVerifyOtp'));
    const upsertAt   = body.indexOf(".from('profiles').upsert(");
    const reminderAt = body.indexOf('setReminderStep(true)');
    expect(upsertAt).toBeGreaterThan(-1);
    expect(reminderAt).toBeGreaterThan(upsertAt);
    expect(body).toMatch(/applyPendingReferral\(formatted\)/);
  });
});

describe('backlog 84 - the act is shown once', () => {
  test('Act Completed hides a title that repeats the story', () => {
    expect(code('src/screens/MyStoryScreen.js')).toMatch(/!sameActText\(completedTitle, completedStory\)/);
  });
});
