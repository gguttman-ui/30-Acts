# 30 Acts of Kindness — Post-Launch Backlog

**Started: Saturday, August 29, 2026 — 8:15 AM Central Time**

Work that is deliberately deferred until after the app is live. Nothing here
blocks submission. Add to it as things come up.

> **Not on this list:** items that block App Store submission. Those live in the
> current handoff doc. As of today they are the CO-1 $15 fee (due ~9/16), the
> Venmo charity profile refusing payments, and real SMS delivery never having
> been tested end to end.

---

## 1. Automate the App Store download count

**Why it waits:** the App Store Connect API returns nothing until the app is
live and has real downloads. Building it now means writing an integration that
cannot be tested.

**Today's behavior:** the Admin "Downloads" tile reads `app_metrics.downloads`,
a row updated by hand:

```sql
UPDATE public.app_metrics SET value = 1234, updated_at = now()
WHERE key = 'downloads';
```

**What automating it takes:**

- An App Store Connect API key — Issuer ID, Key ID, and a `.p8` private key,
  created under Users and Access → Integrations
- A role with Sales and Reports access (Admin, Finance, or Sales)
- The vendor number
- ES256 JWT signing on every request
- A Supabase Edge Function (`sync-downloads`) on a daily `pg_cron` schedule —
  the same pattern already used by `send-reminders` — that pulls the Sales
  report and updates that one row

**No database change needed.** `app_metrics` already holds the value; the
function would write the same row instead of a person typing it.

**Caveats:** the data is next-day, in Pacific Time, so the tile will always be
about a day behind. The report arrives as a gzipped TSV; the download count is
the Units column.

**Rough effort:** about an hour once there is live data to check against.

**Do it when:** a few days of real downloads exist, so the automated number can
be compared against what App Store Connect shows.

---

## 2. Separate Supabase staging database

**Why it waits:** it only matters once production holds real user data.

**Already written and sitting on the Desktop:**

- `SUPABASE-STAGING-SETUP-20260828.md` — the full nine-step setup
- `staging-setup.ps1` — runs the schema dump and function deploy steps

**The shape of it:** a second free Supabase project mirroring production, with
the `preview` EAS channel pointed at staging and `production` at the live
project. The riskiest single mistake is a staging `pg_cron` job still pointed at
the production function URL.

**Do it when:** real users exist and testing against production stops being
acceptable. That is roughly the day after launch.

---

## 3. Delete the dead ShareRow component

`src/components/ShareRow.js` (written ~July 31) is imported by nothing. It is an
older, worse share implementation that was superseded by
`src/components/ShareButtons.js` on August 29.

It was left in place rather than deleted to keep the share refactor easy to
review. Safe to delete once the new share UI has been through a full test pass
and nobody wants to look back at the old one.

**Effort:** one minute.

---

## 4. Tidy the leftover share styles

Now that all six share call sites render from `ShareButtons.js`, the per-screen
`socialRow` / `socialBtn` / `shareRow` / `shareBtn` / `sharePrompt` style blocks
in `MyStoryScreen.js`, `DailyActScreen.js`, `HistoryScreen.js` and
`CertificateScreen.js` are unused.

They are harmless — dead style objects cost nothing at runtime — but they are
exactly the kind of thing that invites someone to hand-copy the markup back into
a screen and start the drift all over again.

Also: `DailyActScreen.js` referenced `s.socialImg`, a style that was never
defined. Never fired, since no social button carries an image. Worth cleaning
up in the same pass.

**Do it when:** the share UI has passed a full device test, so there is no
reason to revert.

**Effort:** fifteen minutes, low risk, but do it in its own commit.

---

## 5. Clean up hosted share cards

Emailing an act now uploads the rendered card to the public `act-media` bucket
under `share-cards/`, so the picture can render inside the message body — an
`<img>` needs a real URL, and email clients strip `data:` URIs.

Two consequences that need attention once there is real traffic:

- **They accumulate.** Every emailed act leaves a JPEG behind forever. At any
  volume this needs a retention job — a `pg_cron` sweep deleting
  `share-cards/*` older than, say, 90 days would do it.
- **They are public.** Anyone holding the URL can view the card. That is what
  makes it render in someone else's inbox, and it is the same bargain the app
  already makes for act media — but it is worth a deliberate look before the
  volume is real.

**Do it when:** emailed shares are actually happening, or before any privacy
review.

---

## 6. PayPal donate path — no preset amount

The PayPal link is a managed QR code:
`paypal.com/qrcodes/managed/ea84696b-…`

That URL format accepts **no amount parameter**, so PayPal opens with an empty
box and the payer types whatever they like. Venmo prefills because
`venmo://paycharge` takes `&amount=`; there is no equivalent for a managed QR
link. It also means no guest card checkout, so a donor without a PayPal account
hits friction.

**Current workaround (shipped 2026-08-29):** the bracelet screen copies `6.95`
to the clipboard and tells the payer to paste it. Better than nothing, but wrong
amounts are still possible.

**The real fix, either of:**

- **PayPal.me handle** — the URL becomes `paypal.me/<handle>/6.95` and the
  amount is prefilled. Smallest change: set the handle up in PayPal, then one
  line in `DONATIONS` in `src/constants/index.js`.
- **Hosted donate button** — create one in PayPal with a preset amount; gives a
  `paypal.com/donate?hosted_button_id=…` link and restores guest card checkout.

Both are PayPal account-side tasks first. Once the link exists, wiring it is a
one-line change.

**Do it when:** there is real donation or bracelet traffic, or sooner if wrong
payment amounts start needing manual reconciliation.

---

## 7. Admin browse redesign

The Admin screen overhaul was started earlier; the browse redesign was fully
built but never landed on disk because of file-delivery problems at the time.
File delivery is no longer an issue — the repo folder is connected directly now,
so this could be picked back up whenever it is worth the attention.

---

## 8. Confirm Supabase backup retention

Supabase runs automatic backups, but retention depends on the plan, and
free-tier retention is short. Worth checking what the project actually keeps
(Database → Backups) **before** relying on it for real user data.

Related: free-tier projects pause after about a week of inactivity, which will
matter for the staging project in item 2.

---

## Adding to this list

Keep it to things that are genuinely deferred, with a note on *why* they wait
and *when* to pick them up. An item without a trigger condition tends to sit
here forever.
