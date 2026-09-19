# Automated testing — 30 Acts of Kindness

Two layers, in order of value-for-effort:

1. **Unit tests (Jest)** — fast checks of pure logic (phone formatting, ZIP lookup).
   Run on your laptop in seconds. This is where the regressions we hit live.
2. **End-to-end (Maestro)** — drives the real app on a simulator/device through
   signup and login, using the **built-in test number** so no real SMS is needed.

What stays manual (can't reasonably automate): real reminder-SMS delivery and
STOP/HELP replies, the Day 30 Twilio/email blast, accessibility eyeballing, and
App Store review.

---

## 1. Jest unit tests

### One-time setup
```
npx expo install jest-expo
npm install --save-dev jest @testing-library/react-native react-test-renderer
```

### Run
```
npm test            # run once
npm run test:watch  # re-run on file changes
```

### What's covered now
- `__tests__/phone.test.js` → `src/lib/phone.js` (phone formatting / validation)
- `__tests__/zip.test.js` → `src/lib/zip.js` (ZIP lookup, network mocked)
- `__tests__/streak.test.js` → `src/lib/streak.js` (streak dedupe, 30-day grid,
  window math, gap detection — the logic behind Seed 29 / Day 30)
- `__tests__/day30.test.js` → `src/lib/day30.js` (Day 30 notification routing:
  phone→SMS, email→email, contact-email copy)

### Add more
Drop a `*.test.js` file in `__tests__/`. For screen behavior (e.g. the phone-first
sign-in branching), add `@testing-library/react-native` component tests — render
the screen, mock `../lib/supabase`, simulate taps, and assert which fields show.
That's the natural next layer once these unit tests are green.

> Note: `src/lib/phone.js` currently mirrors the same helpers still defined inside
> `AuthScreen.js`. The clean follow-up is to have AuthScreen import from
> `src/lib/phone.js` so there's one source of truth — do that as its own change and
> re-run the signup smoke test after.

---

## 2. Maestro end-to-end

[Maestro](https://maestro.mobile.dev) runs simple YAML flows against the actual app.

### One-time setup
```
curl -Ls "https://get.maestro.mobile.dev" | bash
```
Then have an iOS Simulator (or a device) running the app — a dev build or the
TestFlight build both work.

### Run
```
maestro test .maestro/01-signup-new-user.yaml
maestro test .maestro/02-login-returning.yaml
```

### Flows included
- `01-signup-new-user.yaml` — phone-first signup with the test number
  **(555) 010-0142** (code auto-fills). **Reset the test account first**
  (run `supabase/scripts/reset-tester.sql`) so it's treated as new.
- `02-login-returning.yaml` — the same number logging straight back in (no code,
  no fields). Run **after** signup, without resetting.

### Making them reliable
Maestro matches on-screen text, which is brittle. For anything that flakes, add a
`testID="..."` prop to that element in the code and target it here with `id:`.
The `appId` is set for iOS (`org.30actsofkindness.app`); for Android use
`org.actsofkindness.app`.

---

## Suggested routine before an App Store submission
1. `npm test` — logic is green.
2. `maestro test .maestro/` — signup + login happy paths pass on a simulator.
3. Walk the manual spreadsheet (`30Acts-Test-Script.xlsx`) for the SMS, Day 30,
   and accessibility items that can't be automated.

---

## Verified on device — 19 September 2026

The batch committed 18 September (items 30, 35, 11 plus the 17 September
cleanup) went through a device pass on staging build 1.0.0 (22). Ten of the
eleven checks pass. One could not be run. Detail below is kept because the
next batch will want the same checks.

| # | What | Result |
|---|---|---|
| 1 | Settings shows `db - staging` on Stg, `db - production` on prod | pass |
| 2 | Admin screen, every tab populates | pass, with a bug found - see below |
| 3 | Reviewer screen populates | pass |
| 4 | Logging an act moves `select count(*) from completions` | pass, 232 -> 233 |
| 5 | iOS offers the phone number on the sign-in field | pass |
| 6 | First Name / Last Name / ZIP offer saved values | pass |
| 7 | SMS code still autofills | pass |
| 8 | Mail sheet open two minutes produces no App Hang in Sentry | pass |
| 9 | Ordinary error reporting still reaches Sentry | NOT VERIFIED |
| 10 | Share row layout on My Story, day detail and Certificate | pass |
| 11 | Privacy Policy 2.2 and 2.5 | pass |

### Why check 9 is not verified

Nothing in the code calls `captureException` or `captureMessage` deliberately,
so there is no way to trigger an error on demand. The absence of new Sentry
issues does not distinguish "no errors happened" from "errors are not being
sent", so it cannot be recorded as a pass. The change itself was one config
line that disables hang detection and does not touch error capture, so the
risk is low - but low risk is not verification.

To make this checkable, add a hidden trigger (for example, five taps on the
build stamp at the bottom of Settings firing a `Sentry.captureMessage`). It is
JavaScript only, so it ships with `eas update --branch preview`, and it will be
wanted again for item 38 (dSYM upload) and after any future Sentry config
change.

### Found while running check 2

`is_admin()` had never returned true for anyone - it joined `admins.phone` to
`profiles.phone` and every `admins` row has `phone` null. The Admin Review tab
therefore showed an admin only their own acts (78 of 233 on staging). Fixed on
both projects the same day; see `supabase/migrations/20260919_fix_is_admin.sql`
and backlog item 39.

### Test data

Staging was snapshotted before the session (`Desktop\30acts-backups\
staging-snapshot-20260919.md`) and restored to it afterwards: 15 auth users,
14 profiles, 232 completions, 4 sponsors, 1 sponsor member, 3 recognition
orders. Do the same next time - the snapshot-and-restore is quicker and more
reliable than a dump, and `supabase db dump` needs Docker, which is not
installed.

### Already verified earlier, no need to repeat

- Backlog 23 and 24 - the dashboard lap/streak fix and unearned tile dates.
- `db - staging` appearing at all (update `01a0b5ac`, 18 Sep).

---

## Getting a build onto a phone (19 September 2026, item 26)

Staging and production are now separate apps and live on the same phone at the
same time. Nothing needs deleting to switch between them any more.

| | Production | Staging |
|---|---|---|
| Home screen | **30 Acts** | **30 Acts Stg** (red STAGING band) |
| Bundle id | `org.30actsofkindness.app` | `org.30actsofkindness.app.staging` |
| App Store Connect | 6762151038 | 6813974376 |
| Update channel | `production` | `preview` |
| Database | `mtfyekdxtkdiaqbgaoza` | `rhalruwxylggkrebyesf` |

### JS-only change - no build needed

```
eas update --branch preview --environment preview
```

Reaches every staging tester in seconds. This is the normal path.

### Native change - new build and submit

```
eas build  --profile staging --platform ios
eas submit --profile staging --platform ios --latest
```

Apple processes it for 10-20 minutes, then it appears in TestFlight for the
`Staging` internal group. No Beta App Review for internal testers.

### Adding a tester

1. App Store Connect - **Users and Access** - the person must be a user on the
   account, and their **Apps** list must include *30 Acts of Kindness Staging*.
   An existing user who only has production checked will NOT appear in the
   tester picker. That is the usual reason someone is "missing".
2. Staging app - **TestFlight** - **Staging** group - **+** - add them.

### First install on a phone

Open **TestFlight** on the phone, pull to refresh, tap INSTALL. If it is not
listed, profile icon - **Redeem** - enter the code from the invite email.

**If Redeem spins forever:** the phone still has an older ad-hoc build of the
same bundle id. Delete the **30 Acts Stg** icon, then redeem again.

### Check before trusting anything

Settings, bottom of the screen. The Stg app must read `db - staging` and the
production app `db - production`. The build log resolves EAS's *production*
environment for store builds and the build-profile env overrides it, so the
on-device stamp is the proof, not the log.
