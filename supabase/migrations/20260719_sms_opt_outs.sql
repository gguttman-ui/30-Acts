-- ---------------------------------------------------------------------------
-- SMS opt-out ledger
-- ---------------------------------------------------------------------------
-- Authoritative record of phone numbers that have opted OUT of reminder SMS.
-- Written by:
--   * the sms-webhook edge function   (inbound STOP / UNSUBSCRIBE / CANCEL ...)
--   * the send-reminders edge function (self-heal when Twilio returns 21610,
--     "recipient has opted out")
-- Read by:
--   * the send-reminders edge function (skip anyone listed here before sending)
--
-- Phones are stored in the same E.164 form the app uses everywhere else:
--   +1XXXXXXXXXX
--
-- RLS is enabled with NO policies, so the anon/authenticated client keys can
-- neither read nor write it. Only the service/secret key used by the edge
-- functions bypasses RLS. That is intentional: opt-out state must not be
-- editable from the app.
-- ---------------------------------------------------------------------------

create table if not exists public.sms_opt_outs (
  phone        text primary key,
  opted_out_at timestamptz not null default now(),
  source       text,                 -- 'sms_stop' | 'twilio_21610' | 'admin'
  keyword      text,                 -- the exact inbound word, when applicable
  user_id      uuid references auth.users (id) on delete set null
);

alter table public.sms_opt_outs enable row level security;

-- (No policies on purpose — deny-all to client keys; edge functions use the
--  secret key which is not subject to RLS.)

comment on table public.sms_opt_outs is
  'Phone numbers that opted out of reminder SMS. Written/read only by edge functions (secret key).';
