// Send daily-act reminders (slot 1 + slot 2) to users whose local time
// matches their configured reminder, skipping anyone who already
// completed today. Quiet hours: 6 AM - 10 PM in user's local timezone.

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

const REMINDER_TEXT =
  "30 Acts: don't forget today's act of kindness! Reply STOP to opt out.";

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

async function sendTwilio(toPhone: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
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
    return { ok: false, error: `${res.status}: ${errText}` };
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

  const summary = {
    checked: 0,
    sent: 0,
    skipped_completed: 0,
    skipped_already_sent: 0,
    skipped_quiet: 0,
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

      const phone = u.email.replace('@phone.30acts.app', '');
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