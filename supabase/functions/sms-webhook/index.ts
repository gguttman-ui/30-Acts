// Inbound SMS webhook (Twilio "A message comes in" handler).
//
// Purpose: keep our own opt-out ledger (public.sms_opt_outs) in sync with what
// users text us, so send-reminders never messages someone who said STOP.
//
// Replies to STOP / START / HELP directly with a <Message> TwiML, AND mirrors
// opt-out state into public.sms_opt_outs.
//
// NOTE: These direct replies are for when Twilio Advanced Opt-Out is OFF (the
// current setup — reminders send from the raw From number, so Advanced Opt-Out
// never applies and nothing else answers inbound texts). If you later enable
// Advanced Opt-Out on a Messaging Service, REMOVE the reply strings below and
// return empty TwiML, or users will receive two texts per keyword.
//
// Wire-up: set this function's URL as the number's inbound webhook, with a
// ?token=<SMS_WEBHOOK_TOKEN> query string. See TWILIO_SETUP.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SECRET_KEY   = Deno.env.get('REMINDERS_SECRET_KEY')!;   // reuse the edge secret key
const WEBHOOK_TOKEN = Deno.env.get('SMS_WEBHOOK_TOKEN') ?? ''; // shared secret in the URL

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SECRET_KEY);

const STOP_WORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);
const HELP_WORDS  = new Set(['HELP', 'INFO']);

// Reply copy. Kept short; STOP line stays standard for compliance.
const HELP_REPLY  =
  '30 Acts of Kindness reminders: up to 2 texts/day to log your act of kindness. ' +
  'Reply STOP anytime to cancel — no action needed to keep getting them. ' +
  'Msg & data rates may apply. More: 30actsofkindness.org';
const STOP_REPLY  =
  "You've been unsubscribed from 30 Acts of Kindness reminders and won't receive any more. Reply START to resume.";
const START_REPLY =
  'Got it. To restart daily reminders, open the 30 Acts of Kindness app and turn them on in the Me tab.';

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Empty message -> empty <Response> (no reply). Non-empty -> a single <Message>.
const twiml = (message?: string) => {
  const inner = message ? `<Message>${xmlEscape(message)}</Message>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } });
};

// Best-effort lookup of the auth user id for a phone, via the profiles table.
async function userIdForPhone(phone: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  // Lightweight auth: require the shared token on the query string. (Prefer
  // also validating the X-Twilio-Signature header in production.)
  const url = new URL(req.url);
  if (WEBHOOK_TOKEN && url.searchParams.get('token') !== WEBHOOK_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  // Twilio posts application/x-www-form-urlencoded.
  const form = await req.formData();
  const from = String(form.get('From') ?? '').trim();       // E.164, e.g. +13125550123
  const body = String(form.get('Body') ?? '').trim();
  const word = (body.toUpperCase().match(/[A-Z]+/) ?? [''])[0]; // first alpha word

  if (!from) return twiml();

  let reply: string | undefined;

  try {
    if (STOP_WORDS.has(word)) {
      const userId = await userIdForPhone(from);
      await supabase.from('sms_opt_outs').upsert(
        { phone: from, source: 'sms_stop', keyword: word, opted_out_at: new Date().toISOString(), user_id: userId },
        { onConflict: 'phone' },
      );
      if (userId) {
        const { data: u } = await supabase.auth.admin.getUserById(userId);
        const meta = u?.user?.user_metadata ?? {};
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { ...meta, reminder_enabled: false },
        });
      }
      reply = STOP_REPLY;
      console.log('opt-out recorded for', from, word);
    } else if (START_WORDS.has(word)) {
      // Clear the block. We do NOT auto-re-enable reminders — the user must
      // turn them back on in the app, which re-captures fresh consent.
      await supabase.from('sms_opt_outs').delete().eq('phone', from);
      reply = START_REPLY;
      console.log('opt-out cleared for', from, word);
    } else if (HELP_WORDS.has(word)) {
      reply = HELP_REPLY;
      console.log('help replied for', from, word);
    }
    // Anything else: no state change, no reply.
  } catch (e) {
    console.error('sms-webhook error:', (e as Error).message);
    // Still return 200 so Twilio doesn't retry-storm. If we already chose a
    // reply, send it anyway — the DB write is best-effort.
  }

  return twiml(reply);
});
