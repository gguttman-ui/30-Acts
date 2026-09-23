# 30 Acts of Kindness — Post-Launch Backlog

**Started: Saturday, August 29, 2026 — 8:15 AM Central Time**

Work that is deliberately deferred until after the app is live. Nothing here
blocks submission. Add to it as things come up.

> **Not on this list:** items that block App Store submission. Those live in the
> current handoff doc. As of 2026-09-13 nothing here blocks: the CO-1 was
> submitted with its $15 payment on 2026-08-15 and is under review.
> Two long-standing blockers closed: real SMS delivery was tested end to end and
> works, and the Venmo failure turned out to be our deep link, not the charity
> account — see item 12.

> **Reconciled 2026-09-06** against every handoff from 21 August to 6 September.
> Items 16 to 21 were added in that pass — each had been raised in a handoff and
> never written down here. Items 11 and 12 sit out of numerical order; the
> numbering is left alone on purpose so references in the handoffs stay valid.
>
> **The Desktop copy of this file was stale** — it had stopped at item 8 on
> 30 August. `Docs\POST-LAUNCH-BACKLOG.md` is the real one; the Desktop copy is
> a mirror and was overwritten from this file on 6 September.

> **Synced 2026-09-14.** The repo copy in `Docs\` was missing the "Decisions
> made 2026-09-08" block under item 2; the Desktop copy had it. Both copies are
> now identical and both carry items 23 and 24.

---

> **Two files, one backlog — read this first.**
>
> The live working list is **`Desktop\30-acts-backlog.xlsx`**, items 1-50. It
> carries the current *status*, *priority* and *timing* for every item, and it is
> where new items are added.
>
> **This file is the long-form record.** For items 1-28 it holds far more
> reasoning than the spreadsheet cells do — typically five to ten times the text,
> including the "Decide when implementing" and "Do it when" notes. That is why it
> was not simply regenerated from the spreadsheet.
>
> The two had forked: this file stopped at item 28 on 16 September, while the
> spreadsheet ran to item 45. They were reconciled on **20 September 2026** —
> every item now appears in both, and each item below carries a status line taken
> from the spreadsheet.
>
> When they disagree, the spreadsheet wins on *status and priority*; this file
> wins on *reasoning*.

---

## 1. Automate the App Store download count

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 3 · effort M

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

> **Status (spreadsheet, 20 Sep 2026):** completed before 17 September; deliberately excluded from the working list.

**Why it waits:** it only matters once production holds real user data.

**Already written and sitting on the Desktop:**

- `SUPABASE-STAGING-SETUP-20260828.md` — the full nine-step setup
- `staging-setup.ps1` — runs the schema dump and function deploy steps

**The shape of it:** a second free Supabase project mirroring production, with
the `preview` EAS channel pointed at staging and `production` at the live
project. The riskiest single mistake is a staging `pg_cron` job still pointed at
the production function URL.

**State as of 2026-09-08:** `30-acts-staging` exists — ref
`rhalruwxylggkrebyesf`, Free tier, West US (Oregon), in the **gmail** org
alongside production. It is empty. Work stopped at the schema dump, which needs a
production database password reset. PostgreSQL 17 client tools are installed on
the laptop. Full resume steps are in HANDOFF20260903.md.

### Decisions made 2026-09-08

**No Twilio credentials in staging.** Twilio's test credentials were considered
and rejected — they only accept specific magic numbers and reject everything
else, so they produce errors rather than a usable test path. Instead:

- **The primary control is the data:** staging contains only `555-010-xxxx`
  numbers, which are not dialable. Nothing can be delivered to a real person
  regardless of configuration.
- **The backup control is the secret:** leave the Twilio auth token UNSET in the
  staging Edge Function secrets, so `send-reminders` fails loudly instead of
  sending. Nothing to manage, nothing to leak, no monthly cost.

**Schema changes go to STAGING FIRST, then production.** Not the other way
round. If production leads and staging catches up, staging is a mirror that
tells you nothing.

Each change becomes a numbered file in `supabase/migrations/`, applied to
staging, verified, then applied to production. **This is the real fix behind
this whole item.** Every schema change so far has been typed by hand into the
Supabase SQL editor, which is why `supabase\prod-schema.sql` is 0 bytes, why
nobody has a current table list, and why `get_tree_stats()` exists only inside
the live database where it cannot be read or reviewed. A staging database
without migration discipline drifts out of sync within a fortnight and is worse
than no staging at all, because it invites false confidence.

**Seeding staging from production is fine, table by table.** An earlier handoff
said "do not copy user data"; that was about one specific danger — real phone
numbers in a database with reminder cron jobs — not a technical limit.

```powershell
pg_dump --data-only --table=public.acts_of_kindness -d $prodconn -f acts.sql
```

Run the file in staging. Small tables can go through the dashboard's CSV export
and import instead. Watch foreign-key order when loading — profiles before
completions — or use `--disable-triggers`.

Two rules make it safe:

- **Reference data copies freely** — the acts catalogue, `app_metrics`. No
  personal data, no risk.
- **User-shaped data gets scrubbed on arrival.** Load with cron jobs DISABLED,
  immediately rewrite every phone into the `555-010-xxxx` range and blank the
  emails, notes and shipping addresses, then enable cron. Never the other order.

**NEVER copy the `waitlist` table to staging.** Real phone numbers and real
email addresses, and no test value whatsoever.

The first seed, done right after the launch data wipe, is trivially safe because
production will hold almost nothing. It is the seeds six months from now, when
production holds real stories, where the scrub step earns its place.

**Environment variables.** `eas.json` gets the staging URL and anon key on the
`preview` profile, the live ones on `production`. These are baked in at build
time, so this needs a new `eas build` — the same build that fixes the Sentry
environment tagging (see item 11's second occurrence).

**Free-tier staging pauses after about a week of inactivity.** Expected, not a
fault. It needs a click to wake.

**Do it when:** real users exist and testing against production stops being
acceptable. That is roughly the day after launch.

---

## 3. Delete the dead ShareRow component

> **Status (spreadsheet, 20 Sep 2026):** **Done 17 Sep** · timing Completed · effort S

`src/components/ShareRow.js` (written ~July 31) is imported by nothing. It is an
older, worse share implementation that was superseded by
`src/components/ShareButtons.js` on August 29.

It was left in place rather than deleted to keep the share refactor easy to
review. Safe to delete once the new share UI has been through a full test pass
and nobody wants to look back at the old one.

**Effort:** one minute.

---

## 4. Tidy the leftover share styles

> **Status (spreadsheet, 20 Sep 2026):** **Done 17 Sep** · timing Completed · effort S

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

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing Before Release · effort M

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

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 2 · effort M

**Updated 2026-08-31.** The link is now the PayPal Giving Fund charity page,
`paypal.com/us/fundraiser/charity/5977398`, which takes **no transaction fee** —
tested on the website first, then moved into the app. The fee problem is solved;
the preset-amount problem is not.

That URL format still accepts **no amount parameter**, so PayPal opens with an
empty box and the payer types whatever they like. Venmo does not prefill
either — `venmo://paycharge` takes `&amount=`, but that rail refuses charity
payments outright, so it was removed on 2026-09-02. See item 12.

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

**Check the fee before switching to either.** The Giving Fund route is free;
PayPal.me and hosted buttons are not, so a preset amount would be bought back at
a percentage of every gift. Worth comparing what the preset actually saves in
wrong-amount reconciliation against what the fee costs.
`__tests__/donations.test.js` asserts the current URL and will fail if someone
changes it — read that test before editing the link.

**Do it when:** there is real donation or bracelet traffic, or sooner if wrong
payment amounts start needing manual reconciliation.

---

## 7. Admin browse redesign

> **Status (spreadsheet, 20 Sep 2026):** **Delete** · timing Completed · priority x · effort M

The Admin screen overhaul was started earlier; the browse redesign was fully
built but never landed on disk because of file-delivery problems at the time.
File delivery is no longer an issue — the repo folder is connected directly now,
so this could be picked back up whenever it is worth the attention.

---

## 8. Confirm Supabase backup retention

> **Status (spreadsheet, 20 Sep 2026):** completed before 17 September; deliberately excluded from the working list.

Supabase runs automatic backups, but retention depends on the plan, and
free-tier retention is short. Worth checking what the project actually keeps
(Database → Backups) **before** relying on it for real user data.

Related: free-tier projects pause after about a week of inactivity, which will
matter for the staging project in item 2.

---

## 9. Revisit Sentry replay sampling

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 4 · effort S

**Changed 2026-08-31:** `replaysSessionSampleRate` went from `0.1` to `0` in
`App.js`. At 0.1 Sentry recorded a tenth of *every* session, error or not — that
burned 40 of the plan's 50 monthly replays during two people's testing while the
error count sat at zero. Forty recordings of nothing happening, and no room left
for a replay of an actual crash.

`replaysOnErrorSampleRate` stays at `1`: every session that throws is still
recorded in full, which is the replay worth having.

`__tests__/sentryConfig.test.js` guards both values, because this is a
one-character edit away from costing the quota again.

**Do it when:** the app is live and real users exist. Then a sample of ordinary
sessions genuinely is worth watching — but 50 replays a month will not cover it.
Decide between raising the plan's reserved volume, enabling pay-as-you-go (it is
currently **Disabled**, which is why replays are dropped rather than billed), or
setting the rate to something very small like `0.01`.

**`sendDefaultPii` — decided, not open.** Gary reviewed this on 2026-08-31 and
chose to leave it `true`. It sends IP addresses and user identifiers to Sentry,
which for this app means the phone-proxy email that an account is keyed on. The
tradeoff is that a crash report can be tied to the account that hit it, which is
what makes a support reply possible. Not a leftover default — a call that was
made. Reopen it only if the privacy policy or a review changes what the app
promises about diagnostic data.

---

## 10. Bound the remaining share-sheet calls — DONE 2026-09-01

> **Status (spreadsheet, 20 Sep 2026):** completed before 17 September; deliberately excluded from the working list.

All 14 `RNShare.open` calls across the four share screens are now wrapped in one
shared helper, `src/lib/withTimeout.js`. The four screens had grown three copies
of that helper under two different names with different signatures; there is now
one definition, with tests.

Two things were found while doing it:

- `DailyActScreen.js` had a fourth copy at module level, used by the moderation
  check and the media upload as well. Removed; the import serves those too.
- **A swallowed failure was reading as success.** Callers decide whether to fall
  back to SMS or mailto by checking `res?.success !== false`. A catch returning
  `null` made a timed-out share look like a sent one, so the fallback was
  skipped and the person got nothing sent and no error. Those catches now return
  `{ success: false }`.

`__tests__/certificateShare.test.js` guards all four screens: no unbounded call,
no private copy of the helper, no bare millisecond literals, and no swallowed
failure that reads as success.

---

## 12. Venmo — no preset amount (and the paycharge trap)

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 5 · effort M

**Fixed 2026-09-02:** the Venmo button opened
`venmo://paycharge?txn=pay&recipients=...` with the amount and note pre-filled.
That is Venmo's **person-to-person** rail, and a charity profile refuses a P2P
payment — the sheet resolves the charity by name, then fails with "You can't
donate to this charity right now. Check back soon."

This looked exactly like an account problem and was chased with Venmo support
across five calls and an escalation. It was never the account: donating to the
same charity from inside the Venmo app worked throughout. Proven on device by
changing the funding source (credit card → Venmo balance), the amount
($6.95 → $1.00) and the originating screen, and getting a byte-identical
failure each time.

The button now opens the charity profile (`venmo://users/Actsofkindness30`,
falling back to the web profile) where the Donate button lives.

**The cost:** no pre-filled amount, same as PayPal. Both now copy the figure to
the clipboard and say so. `__tests__/donations.test.js` fails if `paycharge`
comes back — including a hand-built one in a screen.

**If a preset amount ever matters enough:** it needs a payment processor with a
real checkout (Stripe, Givebutter, Donorbox), not a peer-payment deep link.
Weigh that against their fees — the current PayPal Giving Fund route is free.

---

## 11. Sentry app-hang alerts are firing on system UI (false positives)

> **Status (spreadsheet, 20 Sep 2026):** **Done 18 Sep** · timing Completed · effort S

**Seen 2026-09-01:** issue REACT-NATIVE-6, "App Hang Fully Blocked", two events
at ~56s and ~86s, release 1.0.0 (96), on an iPhone SE (3rd gen) — a tester's
device, not Gary's.

**Almost certainly not a real freeze.** The stack is `mach_msg2_trap` on the
main thread: the app waiting on another process. iOS hosts the share sheet, the
Mail composer and the clipboard-paste permission prompt OUT of process, so while
one of those is on screen the main thread legitimately sits blocked on a mach
port and Sentry's detector counts it as a hang. The durations are the giveaway —
56 and 86 seconds is a person composing an email, not a frozen app. Sentry's own
docs name the clipboard-paste permission dialog as a known false positive, and
the X share triggers exactly that.

**Why it matters anyway:** every share will generate one of these. At launch the
alerts become noise, and noisy alerts get ignored — including the real one.

**The fix, either of:**

- `SentrySDK.pauseAppHangTracking()` / `resumeAppHangTracking()` around the share
  handlers (available since sentry-cocoa 8.30). Precise, but it means touching
  every share path.
- `enableAppHangTracking: false` in `Sentry.init` in `App.js`. One line. Loses
  genuine hang detection, which this app has never had a confirmed instance of.

**Before doing either, confirm it.** Open the replay attached to the issue
(`replayId 9bee96fd`) and check what was on screen. If it shows the Mail
composer or a share sheet, it is confirmed noise. If it shows the app frozen on
an ordinary screen, this is a real bug and none of the above applies.

**Do it when:** before launch if the alerts are already annoying, otherwise as
soon as real users start generating them.

**Second occurrence, 2026-09-02 12:18 CDT** — issue `07354483`, "**Fatal** App
Hang Fully Blocked", release 1.0.0 (96), Gary's phone this time. Different
wording from the first: *fatal* means the process actually died, "the user or
the OS watchdog terminated your app".

It happened while Gary was force-quitting the app twice on purpose, to make an
EAS update swap in — which is precisely what that message describes. The replay
is a black screen, which is what a terminated app looks like and tells us
nothing further. Not investigated beyond that, by agreement.

**Two things this occurrence adds to the item:**

1. It is now *two* different phones, so whatever the trigger is, it is not
   device-specific.
2. `environment = production` on a `dist 96` preview build. Sentry's
   environment is unset in `Sentry.init`, so every tester build reports as
   production. That is item 2's third bullet, and until it is fixed these
   alerts cannot be triaged at all after launch — a tester force-quitting and
   a real user's app dying look identical.

**The bar for reopening this:** a hang event from a session where nobody
force-quit and no share sheet was open. Until then, do not change code on a
theory.

---

## 13. The mic dies after deleting acts — DAVID ONLY, not reproducible on Gary's phone

> **Status (spreadsheet, 20 Sep 2026):** **Parked** · timing Before Release · priority 99 · effort Unknown

**The report (David, 2026-09-02):** delete an act, come back to My Story, tap
the mic — nothing. The button still shows the microphone (so `listening` is
false and the tap does reach `startListening`), a second tap does nothing, and
**no alert appears**.

**Status: reverted to the pre-2026-09-02 baseline, and on that baseline Gary
cannot reproduce it — the mic works after three deletions in a row.**

**Read the sequence carefully before spending time on this.** Gary first saw a
dead mic AFTER the first "fix" was already live. He never observed the original
bug on the original code. So the only sighting of the real bug is David's, and
every reproduction after that was of a fault the fixes themselves introduced.

That makes two possibilities, and they call for opposite responses:

- **It is specific to David's phone or account** — an OS version, a permission
  state, a stuck audio session from another app. Nothing in this repo will find
  it, and changing shared code to chase it risks everyone else's mic, which is
  precisely what happened.
- **It is real but rare**, and Gary's three deletions were not the trigger.

**Three attempts, all reasoned from the code and none confirmed on a device:**

1. *Stop-before-start with an abort() teardown and a watchdog.* Theory: the
   shared native session collides with a restart. No effect.
2. *Move the teardown from unmount to blur*, because My Story is reused rather
   than unmounted (true — it is the same reuse behind the act-picker bug). No
   effect.
3. *Bound every await and alert on each failure*, since silence implies an
   unsettled promise. This one **broke the first use of the mic**, which had
   always worked, and had to be reverted along with the other two.

**What is actually known**

- On David's phone: the tap reaches `startListening` (button shows 🎤, not ⏹️),
  neither the success path nor the catch runs, and a second tap does the same.
- On Gary's phone, on the same code: it works, including after three deletions.
- Therefore the difference is in the device or the account, not in the branch
  logic — which is the one place all three attempts looked.

**What to do differently.** Every attempt so far was a guess dressed as a fix.
This needs one of:

- **A device log.** Run the app from Xcode or `npx expo start --dev-client`
  attached, reproduce, and read what `expo-speech-recognition` prints. The
  answer is almost certainly in that console.
- **A Sentry breadcrumb trail.** Add `Sentry.addBreadcrumb` at each step of
  `startListening` — before the permission call, after it, before start, after
  start. Reproduce, then read the trail: the last breadcrumb IS the hanging
  call. This costs one small change and needs no cable.

**Do NOT change this code again on a theory.** Three attempts were reasoned
from reading it; the third broke the mic's first use for everybody. The next
step is instrumentation on a phone that actually fails, or nothing.

**First, cheap and worth doing before any code:** ask David to check
Settings → 30 Acts → Microphone and Speech Recognition are both on, then close
the app fully and reopen. A revoked or half-granted Speech Recognition
permission produces a silent no-op, which matches his symptom exactly and would
explain why nobody else sees it.

**Do it when:** David reports it again on the current build. If he does not, let
it stay closed.

---

## 14. Canada — the app is US-only underneath

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 99 · effort L

**Found 2026-09-03, setting App Store availability.** Gary wanted to launch in
the US and Canada. The app cannot serve Canada as written:

- Signup validates the postal code as exactly five digits (`/^\d{5}$/` in
  `SettingsScreen`), so `M5V 3A8` is rejected and a Canadian user cannot finish
  signing up.
- The time zone comes from `STATE_IANA_TZ`, a lookup of US state codes. No
  provinces, so reminders would have no zone even if signup passed.
- `BraceletFormScreen` hard-codes `ship_country: 'US'`.

Selling the app in a territory where signup fails is a Guideline 2.1 rejection
waiting to happen, so **availability was set to United States only** for the
1.0 submission.

**To add Canada:** accept `A1A 1A1` alongside five digits, extend the time-zone
lookup to provinces, let the bracelet form carry a country, and check what
Twilio needs for Canadian SMS. Not large, but it is a code change and therefore
a new build.

**Do it when:** there is real demand from Canada, or before any marketing push
north of the border.

---

## 15. The `moderate-content` Edge Function does not exist

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing Just after Release · priority 1 · effort S

**Found 2026-09-04**, while answering Apple's question about which external
services the app uses.

`src/lib/moderation.js` POSTs every saved story to
`<project>/functions/v1/moderate-content`. The project has three Edge Functions
— `send-reminders`, `sms-webhook`, `swift-processor` — and that is not one of
them. The call 404s, `if (!res.ok) return false` treats it as "not flagged", and
the save proceeds.

**No harm has come of it.** The function was deliberately written to fail open
so a flaky connection could never block someone recording a genuine act, and the
local word list — the half that actually catches things — runs first and
needs no network. Server-side screening simply never existed.

**Two ways to close it:**

- Write and deploy the function. If it calls an outside provider, that provider
  must be named in the App Store privacy answers and in the review notes, so
  this is not a free change.
- Delete `moderateContent()` and have `isContentBlocked()` return the local
  result. Simpler, honest, and removes a network round trip from every save.

I would take the second unless there is a real appetite for server-side
moderation.

**Do it when:** after the app is approved and released. Not during review — the
review notes tell Apple that submitted text is screened, which remains true
either way, but the code should not change while a reviewer is looking at it.

---

### Code written 22 September 2026 — NOT DEPLOYED

Deleted, not built. `moderateContent()` and the `supabaseEnv` import are gone;
`isContentBlocked()` stays `async` so no call site changed, and now returns the
local wordlist result directly.

Building the function instead would have meant sending every private story to a
third-party moderation provider, which has to be declared in the App Store
privacy answers — a disproportionate price for a filter the local list already
covers. That reasoning is written into `moderation.js` so nobody rebuilds it by
reflex.

The bar has not moved: stories are private to their author, and anything that
can reach another person is human-approved first.

Two side effects: the `[supabase] EXPO_PUBLIC_SUPABASE_*` warning is gone from
the test output, and `moderationCoverage`'s "the filter fails open" block is now
"the filter cannot fail" — there is no longer a failure mode to be open about.

**App-side, so it ships with 1.0.1, not before 1 October.**

---

## 16. Volume and load testing

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing Before Release · priority 1 · effort M

**Added 2026-09-06.**

**Why it waits:** it must run against staging, never production, and staging is
itself paused until Apple approves. Running volume tests against the live
database is how the disk IO warning of 4 September happened.

**What actually needs testing.** Steady state is tiny — one act written per user
per day. The risk is entirely in bursts, and there are three:

- **The sign-up spike from the launch emails.** Every new user triggers a Twilio
  SMS for the one-time code. A standard 10-digit long code sends roughly one
  message per second, so a few hundred people opening the email at lunchtime
  queues for minutes and some codes arrive after people have given up. **Check
  the Twilio throughput limit before the first batch goes out.** This is the most
  likely launch failure and it is an account setting, not a code problem. The
  planned batches of 50 to 75 already smooth it — another reason to keep to them.
- **`send-reminders` fan-out.** One scheduled run touching every user's row, at
  whatever times turn out to be popular. Never tested beyond a handful of rows.
- **Query cost at row counts never seen.** The calendar fetch, the tree count,
  `admin_growth_stats()`, the certificate check.

**Method, in order:**

1. Seed synthetic volume in staging with `generate_series` — 5,000 users x 30
   completions is about 150,000 rows and writes in a minute. Use the
   `555-010-xxxx` range so `is_test_phone()` keeps them out of the metrics.
2. `EXPLAIN ANALYZE` the handful of queries the app really runs, at that size.
   Looking for sequential scans. A missing index turns a 20ms query into two
   seconds, and it shows at 100,000 rows, not at 100.
3. Only then a concurrency tool — k6 or Artillery against the Supabase REST
   endpoint, 50 to 100 virtual users. Watch the **Disk IO budget** in the
   Supabase dashboard, not just CPU. On Nano that budget depletes and then
   throttles, which is exactly what the 4 September warning was.

**Honest assessment:** at the realistic launch size, steps 1 and 2 are worth an
afternoon and step 3 mostly is not. Moving production to Pro/Micro buys more
headroom than any tuning this would find.

**Do it when:** Apple has approved and the staging project is up.

---

## 17. Account deletion — the tombstone design

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing Before Release · priority 1 · effort L

**Verified 2026-09-04.** `delete_my_account()` works: the auth login goes, the
profile row goes, and every completion is anonymised — `user_phone` becomes
`DELETED-<hash>`, and `user_email`, `notes` and `recipient` are cleared.
Confirmed on a real account.

**Gary's decision, 2026-09-06:** a deleted user's ACTS SHOULD REMAIN, and the
people who invited them should keep them in their tree. Kindness done is kindness
done, and an inviter should not lose their tree because someone else left.

### The design

**A tombstone profile, not a shared dummy account.** On deletion, keep a profile
row carrying only the `DELETED-<hash>` phone and the referrer link. No name, no
email, no real phone, no address. The completions stay attached to it exactly as
they already are.

**Why not one shared dummy account for all deleted users:** it breaks the thing
it is meant to protect. If every deleted user's acts hang off a single account,
nothing records whose downline they were in, so the tree counts them for
everybody or for nobody. What keeps a tree intact is preserving the *link*, not
giving the acts a new owner.

**The alternative considered and not taken:** add the departing user's act count
and headcount to the inviter's row (`inherited_acts`, `inherited_people`) and
delete cleanly. Nothing of the deleted user survives, but "People Under Me"
becomes a number that can never be recomputed or audited. The tombstone degrades
more honestly.

### Do this first — one query, before any code

`get_tree_stats()` is a SECURITY DEFINER function that exists only in the live
database. It is not in the repo, and `supabase\prod-schema.sql` is still 0 bytes
from the paused dump, so nobody has read it recently.

**Find out how it resolves the downline.** If it joins through `profiles`, every
deletion already breaks the inviter's tree today and the tombstone fixes it. If
it reads the referrer off the completion rows, the tree may already survive and
there is nothing to build.

### What happens when a deleted user rejoins

They sign in with the same phone and get a **brand new, empty account** — this is
already the behaviour, observed on camera on 4 September with 5550100142. The
tombstone does not change it, because the tombstone carries the hash, not the
real phone, so there is no collision and no lookup that finds it.

That is the correct outcome, and three things follow from it:

- **They do not get their old acts back.** Their calendar starts at day one and
  the certificate is out of reach again. Deletion meant deletion.
- **The old acts stay with the tombstone**, so the original inviter keeps them.
- **The inviter can end up counting them twice** — once as the tombstone, once as
  the new account, if the same person rejoins through the same invite link.
  Rare, harmless, and worth knowing before someone reports it as a bug. Do not
  add de-duplication logic for it; that would need exactly the phone-to-hash
  lookup the next paragraph says to remove.

**IS THE HASH DETERMINISTIC? CHECK THIS.** `DELETED-0e9a1eb2e237` looks like a
hash of the phone number. If it is, the "anonymised" rows are not anonymous:
anyone holding a phone number can recompute the hash and find that person's
history, and two deletions by the same person collapse into one identity. It
should be **random**, or salted with a secret that is not stored beside the data.
Making it random also permanently closes the door on re-linking a rejoining user
to their old acts, which is the behaviour we want anyway.

### Still to close, regardless of the tombstone

- **`recognition_orders` is never cleared.** It holds `ship_name`,
  `ship_street1`, `ship_city` and `ship_zip` — a home address. This is the actual
  privacy hole and it has nothing to do with the tree. Clear it on deletion.
- **`act_title` survives.** Split it: a **catalogue** title is the app's own
  wording and can stay, which is what makes a surviving act still mean something.
  A **custom** title is the user's own writing and should be replaced with a
  generic label such as "A kind act".

**One known limitation, not a bug:** the function matches completions on
`profiles.phone`, so an account whose phone is null keeps its acts untouched.
Only old hand-made test accounts have a null phone; accounts created through the
app always have one.

### The wording has to change too

The review notes and the privacy policy say deletion removes the account and its
content. If anonymised acts persist by design, the deletion screen and the policy
should say so plainly — something like "your account and your stories are
deleted; the anonymous record of acts you completed remains, so the people who
invited you keep their tree." This is a copy change in the app, on the website,
and in the App Store privacy answers, not only a database change.

**Do it when:** immediately after approval, and certainly before the first real
bracelet order. This is the highest-priority item on this list.

### Split into two halves, 22 September 2026

`delete_my_account()` is a **database function, not app code**. The frozen
build 98 therefore does not block it, and the two items under "Still to close"
above can ship **before release**:

- clearing `recognition_orders` — the home address left behind on deletion, and
  the actual privacy hole here
- the `act_title` catalogue-vs-custom split

The tombstone profile, and the wording changes to the deletion screen, the
website and the App Store privacy answers, are app-side and stay in 1.0.1.

The two read-only queries under "Do this first" are unchanged and still come
before any code — they may collapse the tombstone half entirely. Written out
ready to paste in `HANDOFF20260922.md`.

**Do not test deletion on production.** The function is irreversible and
production holds real accounts from 1 October.

---

## 18. `day_number` is renumbered on restart — shares can read "Day 79"

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing Just after Release · priority 2 · effort S to answer

**Raised 2026-08-31, never written down.** Gary's test account shows "Day 79" of
a thirty-day challenge, because `day_number` is renumbered when a challenge
restarts. A share reading `Day 47 … 30 days in a row` says something incoherent
to whoever receives it, and the caption is the most public surface in the app.

**First step is a question, not a change:** confirm whether a real user can
actually reach a day number above 30, or whether it only happens on an account
that has been reseeded by hand. If they cannot, close this.

**Effort:** ten minutes to answer the question; unknown after that.

### Answered 2026-09-22 — yes, a real user reaches Day 79, and that part is now intended

The question was whether a day number above 30 needs a hand-reseeded account.
It does not. `buildGridFromStreak` advances the window by **calendar days since
the first act**, not by acts logged:

```js
// src/lib/streak.js:101-106
const daysElapsed  = Math.floor((today - anchorDate) / 86400000);
const windowIndex  = Math.max(0, Math.floor(daysElapsed / 30));   // 0, 1, 2, ...
const tierStartDay = windowIndex * 30 + 1;                        // 1, 31, 61, ...
```

Anyone still using the app 79 days after their first act sees Day 79. No
reseeding involved. **Per the 22 Sep decision (see item 23), that is now correct
behaviour, not a defect** — a streak counts up until it breaks, so the display
side of this item is closed.

**What remains is narrower and real.** `MyStoryScreen.js:1019` stores the
*displayed* number into the `day_number` column at write time:

```js
day_number: targetDay.dayNumber,
```

Restart Challenge moves the anchor (`loadGridReadOnly` filters on
`last_restart_at`), so the board renumbers from 1 while the old rows keep the
numbers they were written with. Reads and deletes are already defended against
this — they key on `local_date` or `completionId`, never `day_number`
(`MyStoryScreen.js:228`, `992-1001`, `1129`; `App.js:349-357`) — but **one
display path still trusts the stored value**:

```js
// MyStoryScreen.js:240
if (completion?.day_number != null) setDayNumber(completion.day_number);
```

Re-share an act logged before a restart and the caption prints the old number
while the board shows the new one. That is the "Day 79" screenshot from 31 Aug.

**The fix:** drop line 240 and let the caption use the grid's `dayNumber`, which
is already passed in via `route.params.day`. The stored column stays a lifetime
record; nothing should read it for display.

**Not before release.** Display-only, it is in build 98, and it only bites after
a Restart Challenge. Priority 2, just after release.

**The caption wording is decided: leave it.** Gary, 22 Sep, choosing option D of
four. Past day 30 the caption reads `I just completed Day 38 of the 30 Acts of
Kindness™!` — mildly odd next to "30 Acts", but honest, seen only by people past
day 30, and it costs nothing. The alternatives considered were `Day 38 · Lap 2`,
`38 days in a row of the 30 Acts of Kindness™!`, and `Day 8 of Lap 2`; all three
were rejected in favour of spending 1.0.1 on items 15 and 51 instead. **No code
change. Do not "fix" this later without asking.**

---

## 19. Dead camera permissions in `app.json`

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 1 · effort S
>
> **Update from the working list:** app.json declares camera and photo-library permissions for a media path no longer reachable in the UI. The strings show in the App Store listing and at first launch. — 20 Sep 2026: app.json edited - NSCameraUsageDescription and the expo-image-picker plugin removed; expo-image-picker stays in package.json so the unreachable screen still resolves at bundle time. NSPhotoLibraryUsageDescription REWORDED but KEPT: it described the dead proof feature, yet the string is still required, because MyStory, History and Certificate call MediaLibrary.requestPermissionsAsync() with no argument, which asks iOS for full photo-library access when saving a share card. Removing it would break share-to-Instagram; that would need those three calls changed to requestPermissionsAsync(true) plus a device test. NOT CLOSED: permission strings are baked into a binary, so this only lands on the next native build - not worth a rebuild and a fresh review cycle before 1 Oct, and photo/video are planned for a future release anyway. VERIFIED DEAD FIRST: nothing navigates to 'DailyAct'. It is registered in the navigator but no screen routes to it; the live flow is MyStory. DailyActScreen.js stays on disk deliberately - photo and video are coming back.

`app.json` declares camera and photo-library-read permissions for the DailyAct
media path, which is no longer reachable in the UI. The strings show in the App
Store listing and at first launch, asking for access the app does not use.

**Why it waits, and why it needs care:** removing a permission key that
unreachable code still calls is how you discover the code was reachable. It also
requires a native build. Harmless where it stands.

**Do it when:** the next native build is going out anyway, and only alongside
actually deleting the dead media path rather than just the key.

---

## 20. `version` and `runtimeVersion` discipline in `app.json`

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 2 · effort S
>
> **Update from the working list:** runtimeVersion is appVersion, so an OTA reaches every binary on that runtime - including ones built before a native module the update needs. — DECIDED 20 Sep 2026: do NOT change the policy before release. runtimeVersion is {policy: appVersion}, so the runtime version is literally 1.0.0 and every binary with that version accepts the same OTA JavaScript. The hazard is adding a native module, publishing an OTA that uses it, and older binaries crashing on launch with no warning. The robust fix is {policy: fingerprint} (available on SDK 54), where Expo derives the runtime version from the native fingerprint so an OTA can never reach an incompatible binary. But switching changes the runtime version of the next build, which would cut the currently approved binary off from future OTAs and require a rebuild plus another review. Bad trade eleven days out. RULE IN FORCE FROM NOW: bump expo.version whenever anything native changes - a new dependency, a plugin, an Info.plist or permission change. Never publish an OTA that depends on native code the target binary does not have. Move to fingerprint in 1.1.

`app.json` is on version `1.0.0` with `runtimeVersion: appVersion`, so an OTA
update reaches every binary on that runtime — including binaries built before a
native module the update depends on. The mail-composer change of 29 August
degraded gracefully; the next one might not.

**The rule:** bump `version` whenever a native module changes, so old binaries
stop receiving updates they cannot run.

This is a habit rather than a task, but it is written here because it has already
caused one confusing round of "the fix didn't work" reports.

---

## 21. Text and Email now do nearly the same thing

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 1 · effort S

Since captions were reworked, the Text and Email buttons differ only in the
subject line and in Email rendering the card inside the message body. Worth
deciding whether both earn their place in the row, or whether one of them is
just crowding four social circles.

**Do it when:** there is real usage data showing which of the two people
actually tap. Not before — this is a judgement call that guessing will get wrong.

---

## 22. The referral tag is a raw phone number

> **Status (spreadsheet, 20 Sep 2026):** **Delete** · timing Completed · priority x · effort M

**Found 2026-09-08**, while designing the website QR code.

`generateInviteLink()` in `src/lib/branch.js` builds a Branch link whose data
carries `ref: <the inviter's phone number>`, and whose fallback URL is
`https://30ActsofKindness.org?ref=<that phone number>`. `applyPendingReferral()`
then writes that phone into `profiles.referred_by`.

**What that means in practice:** every act anyone shares to X, Facebook,
Instagram or TikTok carries a link that encodes their phone number. Anyone who
inspects the link or follows the desktop fallback can read it. Nobody has been
harmed by this, and the number is not displayed anywhere in the app — but the
app tells users their acts are private, and a phone number travelling inside
every public share is not what a reasonable person would expect.

It becomes sharper the moment a QR code carrying one of these links is printed
on a public website, which is exactly what the launch plan calls for.

**The fix:** give every profile an opaque referral code — a short random string
— and use that as the tag instead of the phone. `referred_by` keeps working the
same way; only the value changes. Old links carrying phone numbers have to keep
resolving for a while, so the lookup needs to accept either form during a
transition.

**This is a code change and therefore a new build.** Not before launch.

**Do it when:** soon after launch, and before any print material or public page
carries a personal invite QR long-term. In the meantime the launch checklist
offers two interim options: accept it, or point the website QR at a separate
organisation account rather than a personal one.

---

## 23. The streak does not close at day 30 — REVERSED 22 September 2026

> **Status (22 Sep 2026):** **Reversed and closed.** The August decision was
> undone; the original behaviour described below as a defect is now the intended
> behaviour. Commit `6c5b1be`.

### The decision changed, 22 September

Gary's ruling, in his words: *"A streak continues to count days until it breaks.
If a user starts again later then that is a new streak and starts at 1."*

So day 30 does **not** close a streak. Day 31 continues it and is numbered 31;
the board rolls onto a second 30-slot page labelled `STREAK · LAP 2`. Only a
missed day ends a streak, and the next one then begins at day 1. Everything the
entry below calls a bug — the 31-to-38 tiles, the LAP 2 page, `Best streak · 38`
— is correct.

**What was unwound.** `bf543bc` (16 Sep) bundled three changes; only the item 23
behaviour came out.

| | |
|---|---|
| `src/lib/runs.js` | `MAX_RUN_LEN = 30` removed. Only a date gap splits a run, so `Best streak` and `This streak` report the true length. |
| `src/lib/dashboardPages.js` | The whole consecutive block now belongs to the challenge, not just whole multiples of 30, and the challenge piece is no longer cut at 30 days. That makes the lap loop already sitting in the file reachable, so `numLaps` can exceed 1. |
| kept | The `padBoard` date fix (item 24) and the `buildPages` extraction out of `DashboardView`. Both stay. |

**Build 98 predates `bf543bc`.** Submitted 11 Sep, approved 15 Sep; the cap
landed 16 Sep. The app Apple approved never had it, so this restores the repo to
what is shipping on 1 October rather than changing it. Nothing here needs to
reach users before release.

**Tests.** `__tests__/streakNoCap.test.js` added — five source-level assertions
that guard against a length cap returning, including the exact text of the
run-splitting condition. The three `dashboardPages` tests that encoded the old
rule were rewritten and two added: 38 days now pages as 1-30 then 31-38, 65 days
as 1-30, 31-60, 61-65, and a separate test proves a real break still starts the
next streak at 1. **22 suites, 350 tests.**

**Do not reintroduce a length cap in `runs.js`.** It silently split live streaks
at 30 and renumbered day 31 as day 1, which is what produced the Aug 26 report.

---

### Original entry, 12 September — kept for the record

> The behaviour described below as a defect is the behaviour we now want. Read
> it as history, not as a specification.

> **Status (spreadsheet, 20 Sep 2026):** completed before 17 September; deliberately excluded from the working list.

**Found 2026-09-12**, in David's dashboard screenshots after a completed run.

A run of Jul 27 to Aug 25 shows correctly as a completed 30-day streak. The days
that follow, Aug 26 to Sep 2, then appear as **STREAK - LAP 2** with tiles
numbered **31 to 38**, on a board that runs on to slot 60. The header reads
**Best streak - 38**.

That last number is the tell. The engine is still counting Jul 27 through Sep 2
as one unbroken 38-day run, so this is not a labelling problem with a cosmetic
fix.

**What it should do**, per the decision of late August: completing day 30 closes
that streak. Aug 26 starts a NEW streak, shown as day **1** on a fresh 30-slot
board on its own page. Best streak should read 30, with a separate 8-day streak
recorded alongside it.

**Where it lives:** the counting in `src/lib/streak.js`, and the grid built by
`buildGridFromStreak`. The 31-to-38 numbering and the 60-slot board are what the
grid does downstream of the count, so fix the count first.

**Watch out:** `findMostRecentStreak` returns all completions in calendar order,
and Restart Challenge is the only mechanism that wipes history. Whatever closes
a streak at 30 must not break either of those. Tests first, per the working
rule on this project.

**Do it when:** after Apple approves the pending 1.0. It is a code change and
therefore a new build, and nothing goes near the binary under review.

---

## 24. The current-streak board pre-labels unearned tiles with future dates

> **Status (spreadsheet, 20 Sep 2026):** completed before 17 September; deliberately excluded from the working list.

**Found 2026-09-12**, in the same set of screenshots.

On the current streak page, day 1 is today and every remaining tile carries the
calendar date it would fall on - Sep 13, Sep 14, and so on out to Oct 5. The
board therefore reads as a schedule of 30 fixed appointments rather than 30 days
to be earned.

Miss a day and every one of those printed dates is wrong, which is a poor
message to hand someone who has just broken a streak.

**The fix:** show the date on a tile once the day is earned, and leave unearned
tiles as plain numbers.

**Do it when:** after Apple approves the pending 1.0. Small, and it pairs
naturally with item 23 since both are in the same grid code.

---

## 25. The HELP auto-reply is Twilio's stock text and identifies nothing

> **Status (spreadsheet, 20 Sep 2026):** completed before 17 September; deliberately excluded from the working list.

**Found 2026-09-14**, from a screenshot of a real reminder on a real phone.

The reminder itself reads:

> 30 Acts of Kindness: don't forget today's act of kindness! Reply STOP to end,
> HELP for help.

Replying **HELP** returns:

> Reply STOP to unsubscribe. Msg&Data Rates May Apply.

That is Twilio's default Advanced Opt-Out response. It does not name the
program, does not say who is texting, and gives no way to reach a human. A
recipient who has forgotten signing up learns nothing from it, and the message
arrives from a bare 833 number with no sender name attached.

**Why it matters beyond politeness:** carrier and CTIA expectations for a HELP
reply are that it identifies the program, states message frequency, notes that
message and data rates apply, gives a support contact, and repeats the STOP
instruction. Toll-free verification is assessed partly on opt-in and opt-out
handling, and this number's verification was already rejected once earlier in
the project.

**The fix:** set custom HELP, STOP and START responses on the toll-free number
in the Twilio Console, under Messaging - Services - Opt-Out Management
(Advanced Opt-Out). Something close to:

> 30 Acts of Kindness (30ActsofKindness.org): daily reminder to do one kind act.
> Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel.
> Help: <a real, monitored inbox>

Use an address that someone actually reads. Keep it under 160 characters so it
arrives as one segment.

**No app build required.** This is a console setting on the Twilio side, not
code, so it does not touch the binary under review and could be done at any
time.

**Do it when:** after go-live, per Gary. Worth doing before the launch emails go
out, though, since that is when the first real strangers start receiving these.

---

## 26. Staging and production cannot coexist on one phone

> **Status (spreadsheet, 20 Sep 2026):** **Done 19 Sep** · timing Completed · effort M

Both builds ship with the bundle identifier `org.30actsofkindness.app`, so iOS
treats them as the same app. Installing the staging preview build removes the
production TestFlight build, and installing production removes staging. Every
switch between environments is a delete-and-reinstall.

**The fix:** give staging its own bundle identifier, for example
`org.30actsofkindness.app.staging`, set per EAS build profile. EAS registers
the App ID and provisioning profile itself. Give it a distinct display name and
icon too, or the two are indistinguishable on the home screen.

**What it buys:** separate storage, so a staging session can never leak into
production, and instant switching instead of a reinstall.

**Why it waits:** the referral chain runs through deep links - Branch, the
`?ref=` parameter, expo-linking. Two apps on one device claiming the same URL
scheme is resolved unpredictably by iOS, so splitting the bundle identifier
also means splitting the URL scheme. The referral chain is the one flow
TestFlight cannot test and that still has to be verified by hand on the store
build (the Part D test). Changing how deep links resolve before that test has
passed would undermine it.

**Do it when:** after launch, and after Part D has passed on the store build.

---

## 27. Reminders keep sending to people who have stopped using the app

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 1 · effort M

A participant who signs up, does a few days and then drifts away keeps receiving
two texts a day for the remainder of their run. Nobody benefits. It costs real
money - roughly a cent and a half per message - and worse, it is exactly the
pattern that produces STOP replies and spam complaints, which is what carrier
reputation is judged on.

**The fix:** in `send-reminders`, skip anyone whose last completion is more than
10 days old, and clear their reminder slots so the state is explicit rather than
silently suppressed.

**Decide when implementing:**
- Off permanently, or paused until they next open the app?
- Send one final courtesy text ("reminders paused - open the app to restart")?
  That is one message instead of twenty, and it reads as considerate rather than
  abandoning them.
- Does "activity" mean a completion, or any app open? A completion is the only
  one currently recorded server-side.

**Do it when:** after launch, once there is real drop-off data to size the
window against. Ten days is a guess until then.

---

## 28. Reduce reminders from two a day to one

> **Status (spreadsheet, 20 Sep 2026):** **Open** · timing After Release · priority 1 · effort M

Two texts a day is the current design and it is the single largest running cost
in the project: 60 messages over a 30-day run, about 80 cents per participant.
One a day halves it, and may well read as less naggy.

**Decide when implementing:**
- Remove the second slot from the reminder card entirely, or keep it as an
  option that defaults to off? The card currently requires reminder 1 before
  reminder 2 can be set, so removing the second slot is the simpler change.
- **This has dependencies outside the app.** The HELP auto-reply says "up to 2
  texts/day" and the toll-free verification was approved against a stated volume.
  Both need updating if the frequency changes, or the program description no
  longer matches what is actually sent.

**Do it when:** after launch, ideally alongside item 27 so the SMS copy and the
toll-free registration are revised once rather than twice.

---

---

## 29. Update Website for App mstore link not waitlist

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Just after Release · priority 1

The website should show a link to the app store and remove waitlist references

**Notes:** Release

---

## 30. Hardcoded production URL and key as fallbacks

> **Status (spreadsheet, 20 Sep 2026):** **Done 18 Sep** · timing Completed · effort S

supabase.js, moderation.js, AdminScreen.js, DailyActScreen.js and ReviewerScreen.js each fall back to the PRODUCTION url and anon key when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY is missing or empty. A staging build with a missing env var therefore writes silently to the live database.

**Notes:** DONE 18 Sep 2026, commit 10382ce. New pure module src/lib/supabaseEnv.js is the only place the EXPO_PUBLIC_SUPABASE_* vars are read; supabase.js re-exports so existing imports still work; the four other files import instead of duplicating. Fallback is now STAGING, not production, and warns. Settings shows a second line, "db - staging" or "db - production", read off the Supabase URL rather than the build channel. Verified on device: update 01a0b5ac showed db - staging. Kept pure so moderation.js tests do not pull in AsyncStorage - the dashboardPages.js lesson again.

---

## 31. Storage bucket limits not set

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing After Release · priority 1 · effort S

The act-media bucket has file_size_limit and allowed_mime_types both null, on production and staging. Any signed-in account can upload a file of any size and any type.

**Notes:** Dashboard setting on both projects, no code change. Low priority now that anonymous upload is closed, but it is free hosting for anyone with an account.

### DONE 22 September 2026, on both projects

Moved up from After Release: it was the only open item both doable before
release and actually exposed at launch.

```sql
update storage.buckets
set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg']
where id = 'act-media';
```

5 MB, JPEG only. Scoped to what actually uploads today — `shareCard.js` writes
`image/jpeg`, and the only other upload path (`DailyActScreen`, jpeg or mp4) is
the dead screen. Verified by `select` on each project.

**Proven end to end on staging before production was touched:** completed an
act, emailed the share, and the card rendered in Gmail. A mime or size mismatch
fails the upload from the user's side, so the settings needed a real send, not
just a matching string.

**Carries a dependency:** bringing photo/video back (item 19) means widening
`allowed_mime_types` to include `video/mp4` and raising the size cap, or those
uploads fail. Noted on item 19.

---

## 32. Storage policy cleanup (record, no action)

> **Status (spreadsheet, 20 Sep 2026):** **Done 17 Sep** · timing Completed · effort -

Four "demo" policies granted the PUBLIC role SELECT, INSERT, UPDATE and DELETE on the act-media bucket. Anyone holding the anon key - which ships in the app binary, is in eas.json and has been in the GitHub repo - could list, overwrite or delete every act photo and share card. Live from early development until 17 Sep 2026.

**Notes:** All four dropped on production; emailed cards still render because the bucket public flag serves reads without RLS. Staging had no bucket at all - created 17 Sep with authenticated-only INSERT and SELECT from the start. Whether the hole was ever exploited was not investigated.

---

## 33. Website is not under version control

> **Status (spreadsheet, 20 Sep 2026):** **Done 18 Sep** · timing Completed · effort S

The four legal pages (privacy, terms, guidelines, moderation) and the rest of the site exist only in public_html on GoDaddy. terms.html has no copy on the laptop at all; privacy.html sits alone in Documents\30 Acts with no index.html or styles.css beside it, so it cannot even be previewed locally.

**Notes:** DONE 18 Sep 2026. public_html pulled down over FTP (cPanel Compress hangs on this account - a full zip ran 12 hours and produced nothing). Repo at Documents\30-Acts-Site, first commit 00f9bc8, 37 files. DEPLOY.md and BACKUP.md in the repo record how it goes back up and why not to edit in cPanel. NOT yet backed up off the laptop - no remote. Found during the import: the staging subdomain is public, indexable, and its donate link is still the old fee-charging PayPal managed-QR URL.

---

## 34. No way to edit an act - add an Update button

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing After Release · effort M

Tapping a completed tile on the dashboard opens MyStory in its finished state. There is no way to correct the title or the wording of the story. The only route is Delete and log it again, which loses the original entry and its timestamp. Add an Update button on the two currently active acts - today and yesterday.

**Notes:** Scope: today and yesterday ONLY - exactly the two acts that can already be deleted and re-added, so Update grants no new power, it just makes an existing capability non-destructive. Older days stay read-only. An edit must not change local_date or day_number - those drive the streak and the board. Anything already shared or emailed keeps the old wording; the share card is a JPEG at a fixed URL and does not update. Also reduces reliance on delete-and-retype, which is the path item 13 (mic dies after deleting acts) shows up on.

---

## 35. Sign-up fields do not use iOS autofill (from Bridget)

> **Status (spreadsheet, 20 Sep 2026):** **Done 18 Sep** · timing Completed · effort S

Signing in means typing all ten digits of a phone number by hand. Bridget asked why the app cannot just take the number from the phone. It cannot - iOS gives no app its own number - but it CAN let iOS offer the saved number above the keyboard for one tap, and the app was not asking it to.

**Notes:** DONE 18 Sep 2026. textContentType/autoComplete added to Mobile Number, First Name, Last Name and ZIP. The trap: AppInput in components/index.js destructures a fixed prop list, so the hints were being dropped - adding them at the call sites alone would have changed nothing and looked like iOS simply not offering. AppInput now forwards them. The SMS code field already had oneTimeCode/sms-otp, which is why codes autofill. DO NOT reopen "read the number automatically" - there is no iOS API for it. Caller ID blocking is irrelevant here; it affects outbound calls only. Fails gracefully when there is no Contacts "me" card.

---

## 36. Decide what sits on the production OTA channel before release

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Before Release · priority 1 · effort S

Pressing Release This Version gives real users the approved binary PLUS whatever update is on the `production` channel at that moment. Today that is the OTA from 14 Sep (commit 12f7fcf), which is neither the code the binary was reviewed with nor current main.

**Notes:** Not a code change - a deliberate decision on release day. Either publish a known-good update to production on purpose, or confirm the channel holds what you intend. Check it in EAS: Over-the-air updates -> Channels -> production.

---

## 37. Production OTAs fired on every push to main (record, no action)

> **Status (spreadsheet, 20 Sep 2026):** **Done 18 Sep** · timing Completed · effort -

The EAS workflow .eas/workflows/publish-update.yml ran "on: push: branches: [main]" and published an OTA to the PRODUCTION channel - the one the App Store build reads, with no review and no gate. Live from at least August until 18 Sep 2026. Docs-only commits shipped code to users: "Docs: add backlog item 25", "Docs: add backlog items 23 and 24", "Ignore database backups containing user data".

**Notes:** Fixed 18 Sep 2026, commit 48c0a4e: push trigger removed, workflow_dispatch only. Verified - pushing four days of commits afterwards started no run. The hardcoded update message ("OTA - grid fit, tile glyph, Phone label wrap") was also stale on every one of those updates. Publish deliberately with the CLI so the message is real. Leads to item 36.

---

## 38. Sentry debug symbols (dSYMs) are not uploaded

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Before Release · priority 1 · effort S

Native frames in Sentry come back as "<unknown>" with a Processing Error flag - seen on REACT-NATIVE-6, build 1.0.0 (96). Without the dSYM, Sentry cannot turn an address into a function name, so every native crash or hang report is a wall of hex and tells you nothing.

**Notes:** This blunts Sentry exactly where it is most valuable - a native crash from a real user would be unreadable. Fix is in the build pipeline: have EAS upload the dSYM to Sentry on each build (sentry-expo / @sentry/react-native postPublish or the EAS build hook). Found 18 Sep while investigating item 11.

---

## 39. is_admin() never returned true - admin RLS policies were dead

> **Status (spreadsheet, 20 Sep 2026):** **Done 19 Sep** · timing Completed · effort S

is_admin() joined admins.phone to profiles.phone, but every admins row has phone = null (the Add Admin path writes only the proxy email). The function always returned false, so admin_read_completions and admin_delete_completions never fired. The Admin Review tab showed an admin only their OWN acts - 78 of 233 on staging.

**Notes:** DONE 19 Sep 2026. Rewritten to coalesce(a.phone, split_part(a.email,'@',1)) - not a backfill, because the insert path would reintroduce null on the next admin added. Applied by hand to BOTH projects and recorded in supabase/migrations/20260919_fix_is_admin.sql. Verified: staging Review 78 -> 233, production 17 matching the table. Present since first release; nobody could moderate anyone else's content.

---

## 40. Admin "Review" tab is mislabelled and counts the wrong thing

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing After Release · effort S

The Admin Dashboard tab reads "Review (n)" but lists every completion, not the review queue, and n is the total row count rather than the pending count (233 vs 204). Gary: it should say Completions.

**Notes:** Two small changes in AdminScreen.js line 553: rename the label, and count review_status pending instead of completions.length. Cosmetic - no data involved.

---

## 41. Admin Admins and Reviewers tabs read with the anon key

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Before Release · effort S

fetchAdmins and fetchReviewers use REST_HEADERS, which carries the publishable anon key rather than the signed-in session. Those tabs therefore read as the anon role and show whatever RLS grants anonymous - "No reviewers found" on staging. Every other admin list goes through a SECURITY DEFINER RPC.

**Notes:** Found 19 Sep 2026 while chasing item 39. Same class of bug: a direct query where an admin RPC was needed. Not yet confirmed whether the lists are wrong or merely empty.

---

## 42. Downloads tile shows the 999999 placeholder

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Before Release · priority 1 · effort S

The Admin Growth tile reads 999999, the hand-entered value in app_metrics. Harmless to users (admin-only) but it will be the first number seen on release day.

**Notes:** Set a real value or clear it so the tile shows a dash. Separate from item 1, which is about automating the figure.

---

## 43. No way to trigger a test error for Sentry

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing After Release · priority 1 · effort S

Nothing in the code calls captureException or captureMessage deliberately, so there is no way to confirm error reporting still works after a config change. On 19 Sep check 9 could not be run for exactly this reason: the absence of new Sentry issues does not distinguish "no errors happened" from "errors are not being sent".

**Notes:** Suggested: five taps on the build stamp at the bottom of Settings fires a Sentry.captureMessage. JavaScript only, so it ships with eas update --branch preview and needs no build. Wanted again for item 38 (dSYM upload) and after any future Sentry config change. See TESTING.md, "Why check 9 is not verified".

---

## 44. Production compute was Nano - Disk IO budget being depleted

> **Status (spreadsheet, 20 Sep 2026):** **Done 20 Sep** · timing Completed · effort S

Supabase emailed 20 Sep that production was depleting its Disk IO Budget. TWO causes, both real. (1) The instance was t4g.nano - 0.5 GB RAM, 5 MB/s sustained - with a memory commitment of 1.35 GB, so it swapped continuously and swap traffic drained the budget. (2) net._http_response, pg_net's response table, held 72 live rows in 16 MB - roughly 120x bloat. pg_net's own cleanup worker rescans that heap constantly and was consuming 43% of all query time, 1h 2m in 24 hours. Flat since at least 13 Sep, so neither was caused by a recent change.

**Notes:** DONE 20 Sep 2026. (1) Compute Nano -> Small (2 GB, 22 MB/s, 90 conns not 60), +$5.15/month, $9.68 -> $14.83. Database restarted; production app reconnected cleanly. (2) vacuum full net._http_response: 16 MB -> 136 kB. Autovacuum could not be tuned on it - ALTER TABLE fails with 'must be owner', the net schema is not ours - so cron job 14 'vacuum-net-http-response' runs plain vacuum (analyze) hourly at :17, off the reminder job's cadence. net.http_request_queue was clean (0 rows, 40 kB). Staging was clean too (0 rows, 32 kB), which raises a question for item 16: staging may not run the same cron jobs, so load testing there would not be like-for-like. Disk IO fell 46% -> 29% within the hour on a 24h average still carrying pre-fix hours. Confirm it keeps falling over the next day.

---

## 45. service_role secret key sits in plaintext in a cron job command

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Before Release · priority 1 · effort S

cron.job 7 (send-reminders-5min) embeds the sb_secret_... service_role key directly in its command text, as both the apikey and the Bearer token. Anyone who can read the cron.job table sees it, and that key bypasses RLS entirely.

**Notes:** Found 20 Sep 2026 while investigating Disk IO. Not a public leak - it needs database or dashboard access - but the org has members, and rotating a service_role key after it has spread is far more painful than moving it now. Standard fix is Supabase Vault: store the key there and have the cron command read it, so the secret never appears in cron.job.command. Rotate the key after moving it, on the assumption it may have been seen.

---

## 46. Create Group screen had no back arrow

> **Status (spreadsheet, 20 Sep 2026):** **Done 20 Sep** · timing Completed · effort S

CreateSponsor was registered bare under the stack-wide headerShown:false and renders no header of its own, unlike MySponsors and JoinSponsor which both render a ScreenHeader with onBack. Settings > "Sponsor a New Group" therefore opened a screen with no way out - a user who tapped it by accident was stuck, on both the form view and the post-create QR view.

**Notes:** DONE 20 Sep 2026, commit 08e0f93. Fixed at the navigator (headerShown true + headerLeft goBack, the same shape SponsorDetail already used) so one change covers both views. Reported by Ghenno, verified by Gary. Guarded by __tests__/createGroupExit.test.js.

---

## 47. Restart Challenge did nothing

> **Status (spreadsheet, 20 Sep 2026):** **Done 20 Sep** · timing Completed · effort S

The Settings Restart confirm dialog called onStartChallenge - which is only 'await reloadDays()' - instead of onRestart, so profiles.last_restart_at was never written. The dialog appeared, "Yes, restart" did a plain re-read, and the old streak came straight back on the next load. onRestart was threaded App.js -> AppNavigator -> MainTabs and handed to HomeScreen, but renderSettings never passed it on and SettingsScreen's props signature did not name it.

**Notes:** DONE 20 Sep 2026, commit 08e0f93. Reported by Ghenno, verified in staging by Gary. Guarded by __tests__/restartWiring.test.js, which asserts every link in the chain because the failure was a silent gap in the middle of it. Restart is the only wipe mechanism in the app.

---

## 48. Production build profile set no Supabase env vars

> **Status (spreadsheet, 20 Sep 2026):** **Done 20 Sep** · timing Completed · effort S

eas.json's preview profile set EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY explicitly; production set neither. EXPO_PUBLIC_* values are inlined from the build profile at bundle time, so a production build got undefined for both and fell through to supabaseEnv.js's fallback - which points at STAGING. Any new production build would have shipped pointed at the staging database with nothing on screen saying so.

**Notes:** DONE 20 Sep 2026, commit 08e0f93. Both profiles now name their database explicitly; the fallback is deliberately left pointing at staging (the harmless direction). Guarded by __tests__/buildEnv.test.js, which pins the project ref rather than the key so a rotation does not break the suite. Build 98 predates supabaseEnv.js (18 Sep) and is unaffected. Two things still unverified - see item 50.

---

## 49. Create Group screen uses a light palette

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing After Release · effort M

CreateSponsorScreen's body is #fff with green #2e7d32 while the rest of the app uses the dark C palette. It is the only screen like this. It is also why item 46 had to be fixed with a native header rather than the shared ScreenHeader - ScreenHeader's title colour is C.text (#e8f5e9), which is invisible on white.

**Notes:** Cosmetic only, no functional impact. Doing it means restyling a 455-line screen; once done, the native header from item 46 can be replaced with the shared ScreenHeader so all three group screens match. Deliberately not touched 11 days before launch.

---

## 50. Verify production Supabase key and EAS server-side production env

> **Status (spreadsheet, 20 Sep 2026):** **New** · timing Before Release · priority 1 · effort S

Two unverified things sitting behind item 48. (1) The production publishable key now written into eas.json came from session notes, not from the repo - the 18 Sep refactor stripped the old hardcoded copies and dist/ was empty, so it could not be checked against anything. (2) 'eas update --environment production' reads env vars from the EAS server-side environment, NOT from eas.json, and nobody has confirmed those are set for production.

**Notes:** (1) Supabase dashboard > production project > Settings > API Keys > publishable; compare to eas.json. A wrong key fails loudly - auth breaks immediately - it does not silently write to the wrong database. (2) npx eas env:list --environment production. Same class of trap as the preview one that cost an afternoon on 16 Sep. Both must be done before any production BUILD or production OTA.

---

## Synced 2026-09-23 - status of items changed on 22 and 23 September
> The spreadsheet (Desktop\30-acts-backlog.xlsx) is the live list; this block records what changed so the long-form record stays complete. Newest note first in each entry, exactly as in the spreadsheet.
- **15. moderate-content Edge Function does not exist** - status **Open**, timing Just after Release, priority 1, effort S. DEVICE TESTED ON STAGING 23 Sep 2026 (preview OTA): 'I cleaned up the crap in the park' was refused with the content-not-allowed message; a typed ordinary story saved. Ships with 1.0.1.
- **16. Volume and load testing** - status **Open**, timing Before Release, priority 1, effort M. 23 Sep 2026: fold the staging tests for 52 (three invokes: old secret, new secret, wrong secret gets 401) and 51 (one normal invoke, regression check) into this same session, with the fingerprint-and-restore discipline from 21 Sep.
- **17. Account deletion - tombstone design (database DONE; wording 17c open)** - status **Open**, timing Just after Release, priority 1, effort L. 23 Sep 2026 ADDED TO 17c-app: the screen after Delete My Account says 'See you next time' - wrong after a permanent deletion. Needs a proper account-deleted goodbye screen (confirmation that the account and personal details are gone, thank-you). In-app deletion tested on staging 23 Sep (Gart Goog, Google Voice number): tombstone created, act kept under DELETED- token. 17c-web (website privacy) drafted 23 Sep, publish on release day with item 29; draft adds 2.7 shipping-address and deletion paragraphs, 2.9 self-service deletion sentence, website 2.2/2.5 replaced with the app's versions, effective date October 1, 2026.
- **18. day_number renumbers on restart - shares can read 'Day 79'** - status **Open**, timing Just after Release, priority 2, effort S. CODE WRITTEN 23 Sep 2026, IN GIT 09466dd (pushed 23 Sep), ships with 1.0.1: line 240 of MyStoryScreen.js replaced by a comment; the caption now keeps the grid's dayNumber from route.params.day. Guarded by __tests__/shareDayNumber.test.js (2 tests). npm test: 23 suites, 364 tests, all pass.
- **19. Dead camera permissions in app.json** - status **Open**, timing After Release, priority 1, effort S. ALSO DO WHEN PHOTO/VIDEO RETURNS (added 22 Sep 2026): item 31 set the act-media bucket to image/jpeg only, 5 MB. Bringing DailyActScreen back means widening allowed_mime_types to include video/mp4 and raising file_size_limit, or uploads fail. Dashboard change, no build, but it must ship with that release.
- **27. Stop reminders for inactive users** - status **Open**, timing Just after Release, priority 1, effort M. 23 Sep 2026: BUILT AND TESTED - the only step left is the production deploy of send-reminders on release day, alongside the OTA (same deploy carries 51 and 52).
- **28. Reduce reminders from two a day to one** - status **Open**, timing Just after Release, priority 1, effort M. 23 Sep 2026: BUILT AND TESTED - the only step left is the production deploy of send-reminders on release day, alongside the OTA (same deploy carries 51 and 52).
- **38. Sentry debug symbols (dSYMs) are not uploaded** - status **Done 23 Sep**, timing Just after Release, priority 1, effort S. RESOLVED 23 Sep 2026, NO BUILD NEEDED: SENTRY_AUTH_TOKEN is set in the EAS production environment and Sentry's Debug Files page holds build 98's dSYM (30ActsofKindness, uploaded 11 Sep) plus the FBSDK libraries. Uploads already work; build 96's <unknown> frames predate the token. Guarded by __tests__/sentryUpload.test.js (production profile must not set SENTRY_DISABLE_AUTO_UPLOAD; plugin names org and project).
- **41. Admin Admins and Reviewers tabs read with the anon key** - status **New**, timing Just after Release, priority 1, effort S. CODE WRITTEN AND DEVICE VERIFIED 23 Sep 2026 (preview OTA 01a0cf2e, staging): AdminScreen and ReviewerScreen now use the supabase client for every call - admins/reviewers read/add/remove, rpc delete_user, rpc send_sms_notification, completions read/update, custom_acts insert. Review screen previously loaded NO acts with the anon key (completions RLS). Email branch no longer calls the disabled function. __tests__/adminSession.test.js (16 tests, all fail on old code). npm test 26/393. On device: Admins list loads, remove works, Review tab lists acts. IN GIT 7733178 (pushed 23 Sep). Ships with 1.0.1.
- **42. Downloads tile shows the 999999 placeholder** - status **New**, timing After Release, priority 1, effort S. MOVED TO AFTER RELEASE 23 Sep 2026: production app_metrics checked - downloads is null (updated 2 Sep), so the tile shows no number; 999999 exists only on staging. Nothing to do before release. After release, enter the real count by hand from App Store Connect for the first week or two. Table columns are key, value, updated_at; the one-line UPDATE is written at that time with the real number, never as a template.
- **43. No way to trigger a test error for Sentry** - status **New**, timing After Release, priority 1, effort S. CODE WRITTEN 23 Sep 2026: five taps within 3 s on the Settings build stamp -> Sentry.captureMessage + alert with the event id. src/lib/tapCounter.js (pure) + SettingsScreen wiring; __tests__/sentryTestTrigger.test.js (5 tests). npm test 27/398. DEVICE VERIFIED 23 Sep (preview OTA 01a0cf41): popup appeared and the event arrived in Sentry. IN GIT 7733178 (pushed 23 Sep). Ships with 1.0.1.
- **55. Database functions and admin tables open to the public key** - status **Done 23 Sep**, timing Before Release, priority 1, effort M. 23 Sep pm: step 5 (Twilio rotation) turned out to be NEEDED after all - the live token was hard-coded in send_phone_otp/verify_phone_otp/send_phone_otp_voice. Done under item 59: all Twilio functions now read Vault, token rotated and promoted.

---

## 51. Other writes in send-reminders still discard their errors

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing Just after Release · priority 1 · effort S

recordSend was fixed on 22 Sep to log a failed insert, but recordOptOut (the sms_opt_outs upsert AND its updateUserById) and disableReminders still call supabase without checking the returned error. supabase-js returns errors rather than throwing, so any of these can fail silently. disableReminders is the serious one: if it fails after the shutoff text has gone out, the person keeps their reminder schedule and gets texted again the next day.

**Notes:** STAGING TESTED 23 Sep 2026: regression check passed - four staging invokes each returned checked 3, errors 0, identical to 22 Sep. Remaining: production deploy on release day with 27, 28, 52. | CODE WRITTEN 22 Sep 2026, NOT DEPLOYED (Edge Function - goes out in the 1.0.1 window with items 27, 28 and 52). disableReminders and recordOptOut now return a boolean and console.error their failures. A FAILED SHUTOFF NO LONGER COUNTS AS shut_off - it counts as an error, because the text has already gone out and reporting a clean shutoff while the schedule survives is the same lie that hid the SHUTOFF_SLOT bug on 21 Sep. recordOptOut ATTEMPTS BOTH WRITES even if the first fails: the STOP ledger and the reminder_enabled flag are independent defences and an early return would drop the second. 7 tests added; 22 suites, 362 tests. | Found 22 Sep while chasing a vanished reminder_sends row. That row was rejected by CHECK (slot = ANY (ARRAY[1,2])) and the swallowed error hid it for half an hour of testing. Same class of bug, three more call sites. Low effort: destructure { error } and console.error, exactly as recordSend now does. Guarded for recordSend by __tests__/reminderPolicy.test.js; extend that test to the others when fixing.

---

## 52. Decouple the reminders door check from the admin key

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing Just after Release · priority - · effort S

send-reminders uses ONE value, the REMINDERS_SECRET_KEY Edge Function secret, for two unrelated jobs: line ~176 rejects any request whose apikey header does not string-equal it (verify_jwt is off, so that comparison is the only access control), and line ~22 passes it to createClient as the admin credential. Because of that, the cron command and the Edge Function secret must always change together - change either alone and every tick 401s instantly.

**Notes:** STAGING TESTED 23 Sep 2026, ALL PASS: deployed to staging; (1) old key accepted with door secret unset, (2) REMINDERS_DOOR_SECRET set on staging (random 64 hex) and accepted, (3) wrong value gets 401, (4) old key still accepted with both set - the mid-rollout state. Staging fingerprint of auth.users, profiles, reminder_sends identical before and after. Remaining: production rollout on release day (deploy, set secret in Edge Function secrets and Vault, repoint cron job 7, verify 200), then later remove the fallback. | CODE WRITTEN 22 Sep 2026, NOT DEPLOYED. The door check now reads its own REMINDERS_DOOR_SECRET, and SECRET_KEY is the admin credential only; the comparison is constant-time instead of ===. DEPLOY IN THE 1.0.1 WINDOW, NOT BEFORE 1 OCT - it changes the only access control on a function whose cron is live. ROLLOUT IS ORDER-INDEPENDENT so no tick can drop: (1) deploy - with the new secret unset it still accepts SECRET_KEY exactly as now; (2) add REMINDERS_DOOR_SECRET to Edge Function secrets and Vault - both values accepted; (3) repoint the cron command, verify a tick returns 200; (4) LATER, as its own change, delete the fallback clause so the admin key stops being a valid password. Until step 4 the coupling is loosened, not removed. 5 tests added to reminderPolicy.test.js. | Fix: give the door check its own independent random shared secret, separate from the Supabase key. Rotations then touch one place instead of two. Noted during the 15 Sep rotation and again on 22 Sep; the Vault plumbing added for item 45 makes it easier, since the new secret can live there too. Not urgent - the coupling is documented and both rotations have been done successfully - but it removes a standing footgun.

---

## 53. Short streaks after a long streak get their own page

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing Just after Release · priority 1 · effort S

After a finished long streak, its partial last lap (e.g. LAP 2, days 31-38) sat on a page of its own and the short streaks that followed went to a separate EARLIER STREAKS page. Gary (23 Sep): the short streaks should follow on the LAP 2 page after one blank tile, with no separate page.

**Notes:** DEVICE VERIFIED 23 Sep 2026 on Gary's iPhone (preview OTA 01a0ce9e): LAP 2 shows days 31-38, a blank, then Sep 10, 12, 14; no EARLIER STREAKS page; best streak reads 38. | CODE WRITTEN 23 Sep 2026, IN GIT 09466dd (pushed 23 Sep), ships with 1.0.1 (app-side). src/lib/dashboardPages.js only: a finished streak's partial last lap is left open so packInto fills its free slots; a lap with nothing after it still pads to its full 30-slot board; short streaks that do not fit spill onto a shared page as before. No DashboardView change - its streak branch already renders 'sep' as a blank tile. dashboardPages.test.js: one test updated to the new rule, five added. New tests fail on the old code. Needs a device check via preview OTA.

---

## 54. Mic keeps listening through Save and typing

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing Just after Release · priority 1 · effort S

Found 23 Sep 2026 on device: a dictation session kept running through a blocked Save and through typing/clearing the story box. With continuous recognition iOS resends the whole transcript since the session began, so earlier sentences reappeared in a box the person had just emptied.

**Notes:** IN GIT 09466dd (pushed 23 Sep). CODE WRITTEN AND DEVICE VERIFIED 23 Sep 2026 (preview OTA 01a0ceb6): typing or Save now stops the mic (cutDictation), and results arriving after that cut are discarded; a normal tap-to-stop still keeps its final words. startListening and the result join (the 2 Sep baseline) untouched. __tests__/dictationStop.test.js, 6 tests. npm test: 25 suites, 377. On device: typing a letter stopped the mic immediately and a cleared box stayed empty. Ships with 1.0.1. Possibly related to item 13 (David's mic).

---

## 55. Database functions and admin tables open to the public key

> **Status (spreadsheet, 23 Sep 2026):** **Done 23 Sep** · timing Before Release · priority 1 · effort M

Found 23 Sep 2026 while starting item 41. With only the app's public (anon) key, anyone could: run delete_user (delete ANY account, no check); run send_sms_notification (text any number from our Twilio number; it also held an old Twilio token in plain text); run send_email_notification (it held a live Resend API key in plain text and sent real email); read, add and delete rows in admins and reviewers (make themselves admin).

**Notes:** 23 Sep pm: step 5 (Twilio rotation) turned out to be NEEDED after all - the live token was hard-coded in send_phone_otp/verify_phone_otp/send_phone_otp_voice. Done under item 59: all Twilio functions now read Vault, token rotated and promoted. | DONE ON BOTH PROJECTS 23 Sep 2026, each rehearsed on staging first. (1) delete_user: is_admin() check, anon/public EXECUTE revoked; public key gets 401. (2) send_sms_notification: admin-or-reviewer check, token now read from Vault secret twilio_auth_token (fingerprint a2263ca5 = live TWILIO_AUTH_TOKEN; the embedded token c4cf... was an OLD one, so it had been failing), anon revoked; real admin text sent and received on both projects. (3) send_email_notification: DISABLED (raises), all EXECUTE revoked, key removed; the Resend key (only user was this function, last used ~1 Sep for Act Review emails) DELETED in Resend. (4) admins/reviewers: old public policies dropped; new = read own row or admin, insert/delete admin only, all for authenticated; anon grants revoked; public key read gets 401; Admin tab still shows in preview (staging) and TestFlight build 98 (production). (5) admin_growth_stats already had its own admin check (auth.jwt email in admins) - no change. Remaining: app side is item 41 (1.0.1). Optional: confirm Twilio shows no SECONDARY auth token. Later if wanted: email notifications = new Resend key in Vault + rebuilt function with admin check. send_phone_otp / send_phone_otp_voice / verify_phone_otp must stay open (pre-login) - rate limiting is a possible later item.

---

## 56. Sentry Session Replay freezes the app (fatal app hang)

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing Just after Release · priority 3 · effort S

REACT-NATIVE-8, production build 98, 23 Sep 2026 11:47 CDT: main thread blocked over 2 s in SentrySessionReplay.takeScreenshot; Gary's first tap to add an act did nothing. With replaysOnErrorSampleRate 1, Sentry keeps buffering screenshots in the background so a replay is ready if an error happens; one screenshot blocked the UI.

**Notes:** DECIDED 23 Sep 2026: option A - leave it, watch Sentry after launch. 30-day picture: 3 hang issues, 4 events, 1 user (REACT-NATIVE-8 today; -7 and -6 three weeks ago, pre-dSYM, unreadable). If it recurs: B = replaysOnErrorSampleRate 0 (stops the background screenshots, loses error replays; sentryConfig.test.js guards the current value, so change the test with it) or C = keep replays with Sentry's lighter screenshot mode if the installed @sentry/react-native supports it (research first). Both are JS, ship by OTA. Also confirms item 38: the stack is fully symbolicated.

---

## 57. Tree counts only direct invites, not the whole downline

> **Status (spreadsheet, 23 Sep 2026):** **Done 23 Sep** · timing Before Release · priority 1 · effort S

get_tree_stats counted only people invited DIRECTLY (profiles.referred_by = my phone) plus my sponsor groups' members. Gary (23 Sep): everyone down the tree must accrue to everyone above, like a multilevel chain - A invites X, X invites B, B's acts count for X AND A.

**Notes:** DONE ON BOTH PROJECTS 23 Sep 2026 (database only, no build). get_tree_stats rewritten with WITH RECURSIVE: roots = direct invites + sponsor-group members, then everyone they invited, at every level; UNION (not UNION ALL) counts each person once and stops if a chain loops; the caller is excluded. Staging proof: inviter ...8269 went 1 person / 83 acts -> 2 people / 112 acts when a 29-act member (...0758) was linked under the inviter's invitee (...9481); link removed and baseline 1/83 restored. Production: installed; TestFlight Tree tab loads (8 / 8 / 0). Item 17's deleted_members must be folded into this recursion so a deleted person's downline still rolls up.

---

## 58. Shipping addresses kept forever

> **Status (spreadsheet, 23 Sep 2026):** **Done 23 Sep** · timing Before Release · priority 1 · effort S

recognition_orders kept ship name/street/city/state/zip indefinitely for every customer. Privacy policy 2.7 promises retention only as long as reasonably necessary to administer bracelets. Gary (23 Sep): clear the address 30 days after the order ships; keep the order row.

**Notes:** DONE ON BOTH PROJECTS 23 Sep 2026. public.purge_shipped_addresses() nulls ship_name/street1/street2/city/state/zip (country kept) where shipped_at is over 30 days ago; EXECUTE revoked from anon/authenticated/public. Nightly pg_cron job 'purge-shipped-addresses' at 30 4 * * * (UTC) - production jobid 16, staging also scheduled. Staging proof: test order shipped 31 days ago cleared, one shipped 5 days ago kept; test rows deleted. Production had 0 shipped orders. Privacy wording to state the rule is item 17c.

---

## 59. Anyone could sign in as anyone who has a phone number

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing Before Release · priority 1 · effort M

Every account signs in with a password built from its phone number ('Ph0ne_' + digits + '_30Acts!', in the public repo), and AuthScreen logged an existing number straight in with NO text code (checkExistingPhoneUser, also run automatically for a remembered number). Knowing a number was enough to read someone's stories, change settings, or delete their account - in the app or directly against the API.

**Notes:** 23 Sep 2026. DATABASE (both projects): otp_verifications table (RLS on, no access); verify_phone_otp records each approved check; send_phone_otp, send_phone_otp_voice, verify_phone_otp now read the Twilio token from Vault; new public.require_otp_for_password_login(event) = Custom Access Token hook: a 'password' or 'email/signup' token is refused (403) unless that number has a code check from the last 10 minutes, which it then uses up; token refreshes, non-phone accounts and the reviewer/test numbers +15550100100/+15550100142 pass. HOOK IS ON FOR STAGING ONLY. PRODUCTION: function installed, hook NOT enabled - switch it on on RELEASE DAY together with the 1.0.1 OTA (Authentication > Hooks > Customize Access Token > Postgres, public.require_otp_for_password_login). APP (in git d5ab79f, ships with 1.0.1): AuthScreen code-first - Continue always sends a code; after verification an existing account signs straight in, a new number is asked for name + ZIP then Create account then the reminder step; silent login removed everywhere; __tests__/signInRequiresCode.test.js (6 tests, fail on old code); npm test 28/404. STAGING PROOF: password-formula API sign-in -> 403; returning user (build-98 flow, then the new flow) lands in the existing account with no duplicate; new user via Google Voice (texts to GV do not arrive; call-me works) gets verified -> name/ZIP -> account; Apple reviewer 123456 works; code check used up. TWILIO TOKEN ROTATED 23 Sep (the live token had been hard-coded in the OTP functions and appeared in the chat): secondary token created, then Vault twilio_auth_token (both), Edge secret TWILIO_AUTH_TOKEN (both), Auth phone provider (both) switched, then PROMOTED - old token dead. New fingerprint ba27381b. Production code text after promotion: 201, received. New token in Dashlane 'Twilio auth token (secondary, 23 Sep)'. Sign-ins are rare (audit log: 0-2/day after 16 Sep, 4-20 token refreshes/day), so the extra Twilio cost is about one code per user plus phone changes.

---

## 60. Change my phone number

> **Status (spreadsheet, 23 Sep 2026):** **New** · timing After Release · priority 2 · effort M

The account IS the phone number (sign-in, acts, streak, tree links). Someone who changes number gets a fresh empty account; there is no way to move over. Also, a recycled old number lets its new owner sign in to the old account (true of every phone-number app).

**Notes:** Agreed 23 Sep 2026: after release. Settings > Change my number: verify the new number with a code while signed in, then a database function moves auth email + proxy password, profiles.phone, completions.user_phone, referred_by links (profiles, deleted_members, waitlist), admins/reviewers, sms_opt_outs, reminder rows. Until then, move an account by hand in the SQL Editor on request.

---

## Adding to this list

Keep it to things that are genuinely deferred, with a note on *why* they wait
and *when* to pick them up. An item without a trigger condition tends to sit
here forever.
