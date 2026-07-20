// Inbound SMS webhook (Twilio "A message comes in" handler).
//
// Purpose: keep our own opt-out ledger (public.sms_opt_outs) in sync with what
// users text us, so send-reminders never messages someone who said STOP.
//
// IMPORTANT: We rely on Twilio Advanced Opt-Out (configured on the Messaging
// Service) to send the actual STOP / START / HELP confirmation replies and to
// block traffic at the carrier level. This function therefore returns an EMPTY
// TwiML document — it only mirrors the state into our database. Do not add a
// <Message> reply here or users will receive two texts.
//
// Wire-up: set this function's URL as the number's inbound webhook, with a
// ?token=<SMS_WEBHOOK_TOKEN> query string. See TWILIO_SETUP.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SECRET_KEY   = Deno.env.get('REMINDERS_SECRET_KEY')!;   // reuse the edge secret key
const WEBHOOK_TOKEN = Deno.env.get('SMS_WEBHOOK_TOKEN') ?? ''; // shared secret in the URL

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SECRET_KEY);

const STOP_WORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () =>
  new Response(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } });

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
  const word = body.toUpperCase().replace(/[^A-Z]/g, '');   // first-word-ish normalize

  if (!from) return twiml();

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
      console.log('opt-out recorded for', from, word);
    } else if (START_WORDS.has(word)) {
      // Clear the block. We do NOT auto-re-enable reminders — the user must
      // turn them back on in the app, which re-captures fresh consent.
      await supabase.from('sms_opt_outs').delete().eq('phone', from);
      console.log('opt-out cleared for', from, word);
    }
    // HELP and everything else: no state change. Advanced Opt-Out answers HELP.
  } catch (e) {
    console.error('sms-webhook error:', (e as Error).message);
    // Still return 200/empty TwiML so Twilio doesn't retry-storm.
  }

  return twiml();
});
