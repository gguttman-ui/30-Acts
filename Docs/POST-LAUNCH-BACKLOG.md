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

## 9. Revisit Sentry replay sampling

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

## 16. Volume and load testing

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

---

## 18. `day_number` is renumbered on restart — shares can read "Day 79"

**Raised 2026-08-31, never written down.** Gary's test account shows "Day 79" of
a thirty-day challenge, because `day_number` is renumbered when a challenge
restarts. A share reading `Day 47 … 30 days in a row` says something incoherent
to whoever receives it, and the caption is the most public surface in the app.

**First step is a question, not a change:** confirm whether a real user can
actually reach a day number above 30, or whether it only happens on an account
that has been reseeded by hand. If they cannot, close this.

**Effort:** ten minutes to answer the question; unknown after that.

---

## 19. Dead camera permissions in `app.json`

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

Since captions were reworked, the Text and Email buttons differ only in the
subject line and in Email rendering the card inside the message body. Worth
deciding whether both earn their place in the row, or whether one of them is
just crowding four social circles.

**Do it when:** there is real usage data showing which of the two people
actually tap. Not before — this is a judgement call that guessing will get wrong.

---

## 22. The referral tag is a raw phone number

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

## 23. The streak does not close at day 30

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

## Adding to this list

Keep it to things that are genuinely deferred, with a note on *why* they wait
and *when* to pick them up. An item without a trigger condition tends to sit
here forever.
