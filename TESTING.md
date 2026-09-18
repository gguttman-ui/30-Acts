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

## Pending verification — batch committed 18 September 2026

These changes are committed and on the `preview` channel but have **not** been
through a device pass. Work through them next time the staging build is on a
phone. Nothing here needs a new build - all of it is JavaScript and rides an
`eas update --branch preview --environment preview`.

### Item 30 - one source for the Supabase project

1. **Settings, bottom of the screen.** Two lines now, not one:
   `v1.0.0 - preview - update <id>` and `db - staging`. The second is read off
   the Supabase URL the app is holding, not the build channel. On a staging
   build it must say `staging`. If it ever says `production` on a preview
   build, stop - that is the 16 Sep bug and it is live again.
2. **Admin screen, every tab** - completions, users, admins, reviewers, groups,
   ZIPs, stats. These went from building their own REST headers to importing
   them. A broken import shows as empty lists or "Network request failed",
   not a crash.
3. **Reviewer screen** - the completions list populates.
4. **Log an act, then check staging:**
   `select count(*) from completions;` before and after. The number moves.
   That is the only proof that survives a confident-looking UI.

### Item 35 - iOS autofill on the sign-up fields

5. Sign out, then tap the **Mobile Number** field. iOS should offer your number
   in the bar above the keyboard, for one tap. Needs a phone number on the
   Contacts "me" card - without one nothing is offered, which is correct
   behaviour and not a failure.
6. New-user path: **First Name**, **Last Name** and **ZIP** should offer
   saved values the same way.
7. The SMS code field already autofilled before this change - confirm it
   still does.

### Item 11 - Sentry app hang tracking off

8. Share an act by **Email** and leave the mail sheet open for two minutes,
   then cancel. No "App Hang" issue should appear in Sentry afterwards.
   Before this change that reliably produced one.
9. Confirm ordinary error reporting still works - anything that throws should
   still arrive in Sentry with a replay attached.

### Regressions to watch from the 17 Sep cleanup

10. **Share row layout** on My Story, History and Certificate. Item 4 removed
    style blocks from those screens; the Text / Email / More buttons should
    look exactly as before. A button that has lost its box or gone full-width
    is the tell.
11. **Legal - Privacy Policy**, sections 2.2 and 2.5. Should read "Mobile phone
    number", must NOT mention a password or photos and videos, and 2.5 should
    name Supabase, Twilio, Sentry, Branch Metrics and PayPal.

### Already verified on device, no need to repeat

- Backlog 23 and 24 - the dashboard lap/streak fix and unearned tile dates.
- `db - staging` appearing at all (update `01a0b5ac`, 18 Sep).
