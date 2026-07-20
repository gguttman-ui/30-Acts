# Twilio + SMS Reminder Compliance — Setup & Checklist

_Last updated: 2026-07-19_

This covers everything needed to send **daily reminder SMS** compliantly from the
toll-free number **+18336996137**. Verification OTP (login) is a separate,
transactional message and is unchanged.

---

## 0. What changed in the code (already done)

| File | Change |
|---|---|
| `src/screens/SettingsScreen.js` | Express-consent disclosure at the reminder toggle; captures `reminder_consent_at` + `reminder_consent_version` on Save. |
| `supabase/functions/send-reminders/index.ts` | Requires consent; skips numbers in `sms_opt_outs`; self-heals on Twilio `21610`; message now carries program name + STOP/HELP. |
| `supabase/functions/sms-webhook/index.ts` | **New.** Mirrors inbound STOP/START into `sms_opt_outs`. |
| `supabase/migrations/20260719_sms_opt_outs.sql` | **New.** The opt-out ledger. |

---

## 1. Toll-free verification (required before ANY reminder sends)

Your number is **toll-free (833)**, so the process is **Toll-Free Verification (TFV)**
— *not* A2P 10DLC (10DLC is only for local 10-digit numbers). Unverified toll-free
traffic is heavily filtered/blocked.

In Twilio Console → **Messaging → Regulatory Compliance → Toll-Free Verification**,
submit:

- **Business:** 30ActsofKindness NFP, nonprofit, EIN 41-4058016, address, website
  `https://30actsofkindness.org`, authorized contact.
- **Use case:** Account Notifications / Reminders.
- **Opt-in type:** In-app (Mobile). **Describe it and attach a screenshot** of the
  **Me → Daily Reminder** screen showing the toggle + the consent disclosure.
- **Opt-in language** (paste verbatim — it matches the app):
  > "By turning this on you agree to receive recurring automated text reminders from
  > 30 Acts of Kindness at your sign-up number — up to 2 per day at the times you
  > choose. Msg & data rates may apply. Reply STOP to cancel or HELP for help.
  > Consent is not a condition of using the app."
- **Sample messages** (2–3):
  1. `30 Acts of Kindness: don't forget today's act of kindness! Reply STOP to end, HELP for help.`
  2. `You said STOP. You'll get no more 30 Acts reminders. Reply START to resume.` (HELP/STOP auto-replies)
- **Estimated volume:** low (a few hundred/day at most for Year 1).

Verification typically takes a few business days.

---

## 2. Messaging Service + Advanced Opt-Out (required)

1. Console → **Messaging → Services** → create a service (e.g. "30 Acts Reminders").
2. Add the toll-free number to its **sender pool**.
3. Turn on **Advanced Opt-Out** for the service. This makes Twilio auto-handle
   **STOP / START / HELP** replies and block opted-out numbers at the carrier level —
   this is what satisfies the legal opt-out requirement. Use the default keyword
   responses or set custom ones (program name in the HELP reply).
4. Point the reminder sender at this service if you later switch from the raw
   `From` number to a `MessagingServiceSid` (optional; current code uses `From`).

---

## 3. Inbound webhook (recommended — keeps the app in sync)

So the app's toggle reflects a STOP immediately, route inbound messages to the new
function:

- Deploy it: `supabase functions deploy sms-webhook`
- Console → your number (or the Messaging Service) → **A message comes in** →
  Webhook (HTTP POST):
  `https://<project-ref>.functions.supabase.co/sms-webhook?token=<SMS_WEBHOOK_TOKEN>`

The function returns empty TwiML (no reply) so it never double-texts alongside
Advanced Opt-Out.

---

## 4. Database

Apply the migration in the Supabase SQL editor:

- Run `supabase/migrations/20260719_sms_opt_outs.sql`.

(If you use the CLI: `supabase db push`.)

---

## 5. Environment variables (Edge Function secrets)

Set for **both** functions (`supabase secrets set KEY=value`):

| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | both | project URL |
| `REMINDERS_SECRET_KEY` | both | your `sb_secret_...` key |
| `TWILIO_ACCOUNT_SID` | send-reminders | |
| `TWILIO_AUTH_TOKEN` | send-reminders | |
| `TWILIO_FROM_NUMBER` | send-reminders | `+18336996137` |
| `SMS_WEBHOOK_TOKEN` | sms-webhook | random string; must match the `?token=` in the webhook URL |

Then deploy:
```
supabase functions deploy send-reminders
supabase functions deploy sms-webhook
```

---

## 6. Privacy Policy — add an SMS section (required for TFV review)

The website Privacy Policy currently says nothing about SMS. Reviewers check for
this. Add a short section to `website/privacy.html` (and the in-app privacy doc),
covering:

- We send verification codes and, **if you opt in**, daily reminder texts.
- Frequency (up to 2/day), that msg & data rates may apply.
- How to opt out (STOP) and get help (HELP).
- **"Mobile opt-in data is never shared with or sold to third parties."** ← carriers
  specifically look for this line.

Draft copy is in `Docs/PRIVACY_SMS_SNIPPET.md`.

---

## 7. Test plan (once TFV is approved)

1. In the app, opt in on **Me → Daily Reminder**, set a time 3–4 min out, Save.
2. Confirm the reminder text arrives with the STOP/HELP line.
3. Reply **STOP** → confirm Twilio's opt-out reply, and that a row appears in
   `sms_opt_outs`, and the toggle shows off next time you open Settings.
4. Wait for the next slot → confirm **no** text is sent (skipped_opted_out).
5. Reply **START**, re-enable in the app, confirm texts resume.
6. Complete today's act before a reminder → confirm it's skipped.

---

## 8. Quick reference

- Toll-free number: **+18336996137**
- Opt-out ledger table: **public.sms_opt_outs**
- Consent proof: **user_metadata.reminder_consent_at / reminder_consent_version**
- Self-heal trigger: Twilio error **21610**
