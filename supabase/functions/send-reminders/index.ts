// Send daily-act reminders (slot 1 + slot 2) to users whose local time
// matches their configured reminder, skipping anyone who already
// completed today. Quiet hours: 6 AM - 10 PM in user's local timezone.
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
// Used both to authorize the incoming cron request (apikey header) and to
// initialize the admin Supabase client below.
const SECRET_KEY = Deno.env.get('REMINDERS_SECRET_KEY')!;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  SECRET_KEY
);

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_FROM_NUMBER')!;

// 5-min cron tick -> match anything within +/- 2 min
const WINDOW_MIN = 2;

// Quiet hours: only send between these (user local time)
const QUIET_HOUR_START = 6;   // 6 AM
const QUIET_HOUR_END   = 22;  // 10 PM (exclusive)

// Program name + STOP/HELP in every message (CTIA best practice). Kept to a
// single SMS segment. HELP/STOP replies themselves are handled by Twilio
// Advanced Opt-Out on the Messaging Service.
const REMINDER_TEXT =
  "30 Acts of Kindness: don't forget today's act of kindness! Reply STOP to end, HELP for help.";

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
  await supabase
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
}

Deno.serve(async (req) => {
  // Authorize the request. verify_jwt is disabled for this function (new
  // secret keys aren't JWTs), so the platform no longer gatekeeps. The cron
  // job sends the secret on the apikey header; reject anything that doesn't
  // match so the function can't be invoked by anyone.
  const provided = req.headers.get('apikey') ?? '';
  if (provided !== SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const optedOut = await loadOptOuts();

  const summary = {
    checked: 0,
    sent: 0,
    skipped_completed: 0,
    skipped_already_sent: 0,
    skipped_quiet: 0,
    skipped_no_consent: 0,
    skipped_opted_out: 0,
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

      const slots: { idx: number; h: number; m: number; p: string }[] = [];
      if (typeof meta.reminder_hour === 'number')
        slots.push({ idx: 1, h: meta.reminder_hour,  m: meta.reminder_minute  ?? 0, p: meta.reminder_period  ?? 'AM' });
      if (typeof meta.reminder2_hour === 'number')
        slots.push({ idx: 2, h: meta.reminder2_hour, m: meta.reminder2_minute ?? 0, p: meta.reminder2_period ?? 'PM' });

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
