// 25 Oct 2026: the main reminder switch turns the reminder on at the time
// shown, in one tap. Before, the switch could be ON with nothing scheduled
// (Ghenno, after the 22 Oct inactivity switch-off).
const fs = require('fs');
const path = require('path');

const SETTINGS = fs
  .readFileSync(path.join(__dirname, '..', 'src', 'screens', 'SettingsScreen.js'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('main reminder switch carries the reminder with it', () => {
  test('turning the main switch on or off sets the reminder the same way', () => {
    expect(SETTINGS).toMatch(/if \(which === 'master'\) overrides\.reminder1Enabled = next;/);
    expect(SETTINGS).toMatch(/if \(which === 'master'\) setReminder1Enabled\(next\);/);
  });

  test('the old OFF-only rule is gone', () => {
    expect(SETTINGS).not.toMatch(/which === 'master' && !next\) overrides\.reminder1Enabled = false/);
  });

  test('first visit still lands OFF (only an explicit true is on)', () => {
    expect(SETTINGS).toMatch(/setReminderEnabled\(meta\.reminder_enabled === true\)/);
  });

  test('the saved time is nulled whenever the reminder is off', () => {
    expect(SETTINGS).toMatch(/reminder_hour:\s+r1Enabled \? reminderHour\s+: null/);
  });
});
