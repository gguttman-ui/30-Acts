// Send the daily-act reminder to users whose local time matches their
// configured reminder, skipping anyone who already completed today.
// Quiet hours: 6 AM - 10 PM in user's local timezone.
//
// Changed 2026-09-22:
//   * The access check has its own secret, REMINDERS_DOOR_SECRET, separate
//     from the Supabase admin key (item 52). NOT YET DEPLOYED — it goes out in
//     the 1.0.1 window, not before 1 October. See the DOOR_SECRET note below
//     for the order-independent rollout.
//
// Changed 2026-09-21:
//   * ONE reminder a day (item 28) — the second slot is gone.
//   * Anyone with no completion for INACTIVE_DAYS gets a single explanation
//     instead of that day's reminder, and their reminders are switched off
//     (item 27).
//
// Compliance guards (added 2026-07-19):
//   * Only sends to users with a recorded SMS consent timestamp
//     (user_metadata.reminder_consent_at) — proof of express opt-in.
//   * Skips any phone present in public.sms_opt_outs (STOP ledger).
//   * Self-heals: if Twilio reports 21610 (recipient opted out), the phone is
//     added to sms_opt_outs and the user's reminder_enabled is turned off, so
//     we stop retrying a number that can no longer be reached.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// New-style secret key (sb_secret_...). Replaces the legacy service_role JWT.
// THE ADMIN CREDENTIAL ONLY — see DOOR_SECRET below for the access check.
const SECRET_KEY = Deno.env.get('REMINDERS_SECRET_KEY')!;

// Item 52: the door check gets its own secret, unrelated to the Supabase key.
//
// These were one value. verify_jwt is off for this function, so the apikey
// comparison in Deno.serve is the ONLY access control — and that same value
// was also the admin credential. Rotating the Supabase key therefore meant
// editing the cron command and the Edge Function secret in lockstep; change
// either alone and every tick 401s instantly. That bit us on 15 Sep and again
// on 22 Sep.
//
// DOOR_SECRET is any random string. It has no privileges: it only proves the
// caller is our cron job. Rotating the Supabase key no longer touches cron.
//
// ROLLOUT — deliberately order-independent, so no tick can be dropped:
//   1. Deploy this. With REMINDERS_DOOR_SECRET unset it keeps accepting
//      SECRET_KEY exactly as before, so nothing changes.
//   2. Add REMINDERS_DOOR_SECRET to the Edge Function secrets (and Vault).
//      Both values are now accepted; cron still sends the old one and works.
//   3. Repoint the cron command at the new secret. Verify a tick returns 200.
//   4. LATER, as its own change: delete the `|| matches(provided, SECRET_KEY)`
//      below so the admin key stops being a valid password. Until that line is
//      gone the coupling is loosened, not removed.
const DOOR_SECRET = Deno.env.get('REMINDERS_DOOR_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  SECRET_KEY
);

// Constant-time string compare, so a wrong guess takes the same time to
// reject however much of it was right. Length is allowed to leak; the content
// is not.
function matches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_FROM_NUMBER')!;

// 5-min cron tick -> match anything within +/- 2 min
const WINDOW_MIN = 2;

// Quiet hours: only send between these (user local time)
const QUIET_HOUR_START = 6;   // 6 AM
const QUIET_HOUR_END   = 22;  // 10 PM (exclusive)

// Item 27 (2026-09-21). Someone who signs up, logs a few acts and then drifts
// away used to keep getting a text every day for the rest of their run. Nobody
// benefits, it costs real money, and it is exactly the pattern that produces
// STOP replies and spam complaints -- which is what carrier reputation is
// judged on. After this many days with no completion we send one explanation
// and switch their reminders off.
const INACTIVE_DAYS = 10;

// reminder_sends has UNIQUE (user_id, slot, local_date), which is what makes
// the shutoff notice idempotent: one per user per day.
//
// IT MUST BE 1 OR 2, NEVER 0. The table carries
//   CHECK (slot = ANY (ARRAY[1, 2]))
// from when slots 1 and 2 were the only things recorded here. Slot 0 is
// rejected outright, and because recordSend used to discard its result the row
// simply vanished with nothing on screen to say so. Cost 30 minutes of testing
// on 2026-09-22 before the constraint was read. No source-level test can see a
// database constraint.
//
// Sharing slot 1 with the real reminder is also the behaviour we want: if a
// reminder already went out today, the already-sent check short-circuits before
// the inactivity check, so the shutoff waits until tomorrow rather than landing
// as a second text the same day. `status` is what tells the two apart.
const SHUTOFF_SLOT = 1;

// Program name + STOP/HELP in every message (CTIA best practice). Kept to a
// single SMS segment. HELP/STOP replies themselves are handled by Twilio
// Advanced Opt-Out on the Messaging Service.
const REMINDER_TEXT =
  "30 Acts of Kindness: don't forget today's act of kindness! Reply STOP to end, HELP for help.";

// Sent ONCE, in place of that day's reminder, when someone crosses
// INACTIVE_DAYS. Deliberately warm rather than a rule statement -- it is a
// kindness app, and the person has not failed at anything. Like REMINDER_TEXT
// it must stay plain ASCII: one curly quote or em dash flips the whole message
// from GSM-7 to Unicode and cuts the segment from 160 characters to 70.
const SHUTOFF_TEXT =
  "30 Acts of Kindness: your reminders are off for now. Open the app to start again whenever you're ready. Reply STOP to end, HELP for help.";

function to24h(hour12: number, period: string): number {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function nowInTz(tz: string): { dateStr: string; hour: number; minutes: number } | null {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    const hour    = parseInt(parts.hour, 10);
    const minutes = hour * 60 + parseInt(parts.minute, 10);
    return { dateStr, hour, minutes };
  } catch (e) {
    console.warn(`Invalid timezone "${tz}":`, (e as Error).message);
    return null;
  }
}

function matchesSlot(nowMin: number, hour12: number, minute: number, period: string): boolean {
  const target = to24h(hour12, period) * 60 + minute;
  return Math.abs(nowMin - target) <= WINDOW_MIN;
}

// Load the full opt-out ledger once per run into a Set for O(1) lookups.
async function loadOptOuts(): Promise<Set<string>> {
  const set = new Set<string>();
  const { data, error } = await supabase.from('sms_opt_outs').select('phone');
  if (error) {
    console.warn('sms_opt_outs load failed:', error.message);
    return set; // fail open on read error, but 21610 self-heal still protects us
  }
  for (const row of data ?? []) set.add(row.phone as string);
  return set;
}

// The cutoff date for "recently active", computed in UTC and deliberately ONE
// DAY WIDER than INACTIVE_DAYS. completions.local_date is the user's local
// calendar date, which can sit either side of the UTC date; erring wide means
// the worst case is reminding someone for one extra day rather than cutting
// them off a day early.
function activeSinceDate(days: number): string {
  return new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 10);
}

// Phones with at least one completion inside the window, loaded ONCE per run
// into a Set -- the same shape as loadOptOuts. A per-user lookup here would
// multiply the query count by the whole user base on every five-minute tick,
// and this function already walks every user as it is.
//
// RETURNS NULL ON ERROR, AND THAT MATTERS. An empty Set would make every single
// user look inactive, so a transient query failure would text the entire user
// base a shutoff notice and disable everyone's reminders -- unrecoverable,
// because we cannot tell afterwards who had chosen what. Null means "could not
// determine activity this tick", and the caller skips the check entirely.
async function loadActivePhones(sinceDate: string): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from('completions')
    .select('user_phone')
    .gte('local_date', sinceDate);
  if (error) {
    console.warn('activity load failed, skipping inactivity check:', error.message);
    return null;
  }
  const set = new Set<string>();
  for (const row of data ?? []) set.add(row.user_phone as string);
  return set;
}

// Switch reminders off and clear both slots. Nulling the times (rather than
// only flipping reminder_enabled) makes the state explicit: the sender fires a
// slot only when its hour is a number, and the Settings card reads the same
// fields, so the app shows OFF instead of silently suppressing a schedule the
// user can still see. GoTrue merges user_metadata, so a key is removed by
// setting it to null, not by omitting it.
async function disableReminders(userId: string, meta: Record<string, unknown>) {
  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      reminder_enabled:  false,
      reminder1_enabled: false,
      reminder_hour:     null,
      reminder_minute:   null,
      reminder_period:   null,
      reminder2_enabled: false,
      reminder2_hour:    null,
      reminder2_minute:  null,
      reminder2_period:  null,
    },
  });
}

// Record an opt-out (idempotent) and turn the user's reminder toggle off so the
// app UI reflects reality and we stop scheduling them.
async function recordOptOut(userId: string, phone: string, meta: Record<string, unknown>, source: string) {
  await supabase.from('sms_opt_outs').upsert(
    { phone, source, opted_out_at: new Date().toISOString(), user_id: userId },
    { onConflict: 'phone' },
  );
  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...meta, reminder_enabled: false },
  });
}

async function sendTwilio(toPhone: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string; optedOut?: boolean }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const form = new URLSearchParams({
    From: TWILIO_FROM,
    To: toPhone.startsWith('+') ? toPhone : `+1${toPhone}`,
    Body: body,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Twilio error:', res.status, errText);
    // 21610 = "Attempt to send to unsubscribed recipient" (carrier STOP).
    const optedOut = errText.includes('21610');
    return { ok: false, error: `${res.status}: ${errText}`, optedOut };
  }
  const json = await res.json();
  return { ok: true, sid: json.sid };
}

async function alreadyCompletedToday(phone: string, dateStr: string): Promise<boolean> {
  // Use local_date column (set at write-time in user's home TZ) - single source of truth
  const { data, error } = await supabase
    .from('completions')
    .select('id')
    .eq('user_phone', phone)
    .eq('local_date', dateStr)
    .limit(1);
  if (error) {
    console.warn('completions check failed:', error.message);
    return false; // err on side of sending
  }
  return (data?.length ?? 0) > 0;
}

async function alreadySent(userId: string, dateStr: string, slot: number): Promise<boolean> {
  const { data } = await supabase
    .from('reminder_sends')
    .select('id')
    .eq('user_id', userId)
    .eq('local_date', dateStr)
    .eq('slot', slot)
    .maybeSingle();
  return !!data;
}

async function recordSend(
  userId: string,
  dateStr: string,
  slot: number,
  phone: string,
  status: string,
  twilioSid?: string,
  error?: string,
) {
  // This insert used to be fire-and-forget. supabase-js RETURNS errors rather
  // than throwing, so a rejected row vanished silently -- and this table is the
  // whole idempotency guard, so a silent failure means a person can be texted
  // again tomorrow with nothing recording that we already did. A CHECK
  // violation hid here for half an hour on 2026-09-22. Log it.
  const { error: insertError } = await supabase
    .from('reminder_sends')
    .insert({
      user_id:    userId,
      local_date: dateStr,
      slot,
      phone,
      status,
      twilio_sid: twilioSid ?? null,
      error:      error ?? null,
    });
  if (insertError) {
    console.error(
      `recordSend FAILED (user ${userId}, slot ${slot}, ${dateStr}, status ${status}):`,
      insertError.message,
    );
  }
}

Deno.serve(async (req) => {
  // Authorize the request. verify_jwt is disabled for this function (new
  // secret keys aren't JWTs), so the platform no longer gatekeeps. The cron
  // job sends the secret on the apikey header; reject anything that doesn't
  // match so the function can't be invoked by anyone.
  //
  // Accepts the door secret, or the admin key while the rollout finishes.
  // Step 4 of the DOOR_SECRET note at the top removes the second clause.
  const provided = req.headers.get('apikey') ?? '';
  const authorized =
    (DOOR_SECRET !== '' && matches(provided, DOOR_SECRET)) ||
    matches(provided, SECRET_KEY);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const optedOut = await loadOptOuts();

  // Null means the activity query failed; the inactivity check is skipped for
  // this tick rather than guessing. See loadActivePhones.
  const sinceDate     = activeSinceDate(INACTIVE_DAYS);
  const activePhones  = await loadActivePhones(sinceDate);
  const inactiveCutMs = Date.now() - INACTIVE_DAYS * 86_400_000;

  const summary = {
    checked: 0,
    sent: 0,
    shut_off: 0,
    skipped_completed: 0,
    skipped_already_sent: 0,
    skipped_quiet: 0,
    skipped_no_consent: 0,
    skipped_opted_out: 0,
    skipped_activity_unknown: activePhones ? 0 : 1,
    errors: 0,
  };

  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) { console.error('listUsers error:', error.message); break; }
    if (!data.users.length) break;

    for (const u of data.users) {
      const meta = u.user_metadata || {};
      if (!meta.reminder_enabled) continue;
      if (!meta.timezone) continue;
      if (!u.email?.endsWith('@phone.30acts.app')) continue;

      // Express-consent gate: never text a user who has no recorded opt-in.
      if (!meta.reminder_consent_at) { summary.skipped_no_consent++; continue; }

      const phone = u.email.replace('@phone.30acts.app', '');

      // Opt-out gate: honor the STOP ledger before doing anything else.
      if (optedOut.has(phone)) { summary.skipped_opted_out++; continue; }

      const tzResult = nowInTz(meta.timezone);
      if (!tzResult) continue;
      const { dateStr, hour, minutes } = tzResult;

      // Item 28 (2026-09-21): ONE reminder a day. The slot-2 block that used to
      // sit here is gone, so reminder2_* metadata on existing accounts is now
      // simply never read -- no migration needed, and the Settings card nulls
      // those fields on the next save. Do not reintroduce a second slot without
      // revisiting the Twilio HELP copy and the toll-free registered volume.
      const slots: { idx: number; h: number; m: number; p: string }[] = [];
      if (typeof meta.reminder_hour === 'number')
        slots.push({ idx: 1, h: meta.reminder_hour,  m: meta.reminder_minute  ?? 0, p: meta.reminder_period  ?? 'AM' });

      for (const slot of slots) {
        summary.checked++;
        if (!matchesSlot(minutes, slot.h, slot.m, slot.p)) continue;

        // Quiet hours guard: silently skip outside 6 AM - 10 PM local
        if (hour < QUIET_HOUR_START || hour >= QUIET_HOUR_END) {
          summary.skipped_quiet++;
          continue;
        }

        if (await alreadySent(u.id, dateStr, slot.idx)) {
          summary.skipped_already_sent++;
          continue;
        }

        // Item 27: this person has drifted away. Send one explanation in place
        // of the reminder, then switch reminders off. Hanging it off a matching
        // slot means it arrives at the time they chose and inside quiet hours,
        // rather than at whatever tick happened to notice.
        //
        // `createdMs` guards the person who has NEVER completed an act: with no
        // completion to measure from they would look inactive from day one and
        // be shut off before they had begun. Signup starts their clock instead,
        // and an unparseable created_at counts as new -- every unknown here
        // resolves towards leaving the reminder alone.
        if (activePhones && !activePhones.has(phone)) {
          const createdMs = u.created_at ? Date.parse(u.created_at) : NaN;
          const longEnough = Number.isFinite(createdMs) && createdMs < inactiveCutMs;
          if (longEnough) {
            if (await alreadySent(u.id, dateStr, SHUTOFF_SLOT)) continue;
            const stop = await sendTwilio(phone, SHUTOFF_TEXT);
            if (stop.ok) {
              await recordSend(u.id, dateStr, SHUTOFF_SLOT, phone, 'shutoff_notice', stop.sid);
              await disableReminders(u.id, meta);
              summary.shut_off++;
            } else if (stop.optedOut) {
              await recordOptOut(u.id, phone, meta, 'twilio_21610');
              optedOut.add(phone);
              await recordSend(u.id, dateStr, SHUTOFF_SLOT, phone, 'opted_out', undefined, stop.error);
              summary.skipped_opted_out++;
            } else {
              await recordSend(u.id, dateStr, SHUTOFF_SLOT, phone, 'failed', undefined, stop.error);
              summary.errors++;
            }
            continue;
          }
        }

        if (await alreadyCompletedToday(phone, dateStr)) {
          summary.skipped_completed++;
          await recordSend(u.id, dateStr, slot.idx, phone, 'skipped_completed');
          continue;
        }

        const result = await sendTwilio(phone, REMINDER_TEXT);
        if (result.ok) {
          await recordSend(u.id, dateStr, slot.idx, phone, 'sent', result.sid);
          summary.sent++;
        } else if (result.optedOut) {
          // Carrier says this number opted out (replied STOP). Record it so we
          // never try again, and reflect it in the app.
          await recordOptOut(u.id, phone, meta, 'twilio_21610');
          optedOut.add(phone);
          await recordSend(u.id, dateStr, slot.idx, phone, 'opted_out', undefined, result.error);
          summary.skipped_opted_out++;
        } else {
          await recordSend(u.id, dateStr, slot.idx, phone, 'failed', undefined, result.error);
          summary.errors++;
        }
      }
    }

    if (data.users.length < perPage) break;
    page++;
  }

  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
});
