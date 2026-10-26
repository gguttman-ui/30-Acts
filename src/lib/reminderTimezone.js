// reminderTimezone.js -- backlog 86. Reminders follow the person.
//
// send-reminders texts each person by user_metadata.timezone. That used to be
// set only at sign-up and in Settings (the HOME time zone), so a traveller got
// reminders at home-clock times, and near midnight could be reminded about an
// act already logged - acts are dated by the phone (Gary, 21 Oct 2026).
// Each time the app opens we copy the phone's current time zone into
// user_metadata.timezone. Profile state/home time zone are left alone.

/** The phone's IANA time zone ("America/New_York"), or null. */
export function deviceTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isIanaZone(tz) ? tz : null;
  } catch (e) {
    return null;
  }
}

/** "Region/City" style names only - never "UTC" fallbacks or offsets. */
export function isIanaZone(tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z]+\/[A-Za-z0-9_+\-\/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

/** The zone to save, or null when nothing should change. */
export function timezoneToSave(stored, device) {
  if (!isIanaZone(device)) return null;
  return stored === device ? null : device;
}

/**
 * The zone to save when Settings is saved. Settings knows only the HOME zone
 * (from the ZIP); saving that over the phone's zone undid item 86 for anyone
 * away from home (Ghenno in Vienna, 25 Oct 2026: reminder at 9 AM Chicago).
 * Use the phone's zone; fall back to home only when the phone gives none.
 */
export function reminderZoneForSave(home, device = deviceTimeZone()) {
  if (isIanaZone(device)) return device;
  return home || null;
}

let syncing = false;

/**
 * Update the signed-in person's reminder time zone to the phone's.
 * Never throws; a failure just tries again next time the app opens.
 */
export async function syncReminderTimezone(supabase, device = deviceTimeZone()) {
  if (!supabase || syncing) return null;
  syncing = true;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data && data.user;
    if (!user) return null;
    const next = timezoneToSave(user.user_metadata && user.user_metadata.timezone, device);
    if (!next) return null;
    const { error } = await supabase.auth.updateUser({ data: { timezone: next } });
    if (error) throw error;
    return next;
  } catch (e) {
    console.warn('Reminder time zone sync failed:', e && e.message);
    return null;
  } finally {
    syncing = false;
  }
}
