// Backlog 86: reminders follow the phone's time zone (travellers).
import { isIanaZone, timezoneToSave, syncReminderTimezone } from '../src/lib/reminderTimezone';
const fs = require('fs');
const path = require('path');

const fakeSupabase = (meta, updates) => ({
  auth: {
    getUser: async () => ({ data: { user: meta === undefined ? null : { user_metadata: meta } } }),
    updateUser: async (arg) => { updates.push(arg); return { error: null }; },
  },
});

describe('reminder time zone follows the phone', () => {
  test('valid zones only', () => {
    expect(isIanaZone('America/New_York')).toBe(true);
    expect(isIanaZone('Europe/Paris')).toBe(true);
    expect(isIanaZone('UTC')).toBe(false);
    expect(isIanaZone('Not/AZone')).toBe(false);
    expect(isIanaZone(null)).toBe(false);
  });

  test('David, home Arizona, opens the app in New York', async () => {
    const updates = [];
    const saved = await syncReminderTimezone(fakeSupabase({ timezone: 'America/Phoenix' }, updates), 'America/New_York');
    expect(saved).toBe('America/New_York');
    expect(updates).toEqual([{ data: { timezone: 'America/New_York' } }]);
  });

  test('no change at home, signed out, or unknown phone zone', async () => {
    const updates = [];
    expect(await syncReminderTimezone(fakeSupabase({ timezone: 'America/Chicago' }, updates), 'America/Chicago')).toBeNull();
    expect(await syncReminderTimezone(fakeSupabase(undefined, updates), 'Europe/Paris')).toBeNull();
    expect(timezoneToSave('America/Chicago', null)).toBeNull();
    expect(updates).toEqual([]);
  });

  test('App.js syncs at launch and whenever the app comes back', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
    expect(src.match(/syncReminderTimezone\(supabase\)/g) || []).toHaveLength(2);
  });
});
