# Release Workflow — 30 Acts of Kindness

*How a change gets from the laptop to a phone. Written Friday, August 28, 2026 · 7:56 AM CDT (Central).*

---

## The one thing to understand first

A build's **channel is baked in at build time**, and TestFlight and the App Store serve the **same binary**. Build 96 listens to `production`; the App Store release will be that same build listening to that same channel.

**Consequence:** once the app is live, `npx eas update --branch production` reaches real users immediately, with nothing in between. That is why the `preview` channel below is not optional once you launch.

---

## Which path does this change take?

| Change | Path |
|---|---|
| JavaScript only — screens, logic, copy, styles | **OTA update.** Publish to `preview`, verify, then `production`. |
| `app.json`, URL schemes, a new native module, permissions, icons | **New `eas build`.** Cannot be OTA'd. TestFlight → review → release. |
| Supabase Edge Function, SQL, RLS policy | **Deploy separately.** Not carried by an app update at all. |

If you are unsure: if the change is inside `src/`, it is almost certainly OTA-able.

---

## A. JavaScript change (the normal case)

### 1. Test locally

```
cd "C:\Users\Gary Laptop\Documents\30-Acts-current"
npm test
```

33 tests across 4 suites. Do not skip this — it is fast and it has caught real breakage.

### 2. Commit

```
git add -A
git commit -m 'Short description of what changed'
git push
```

> **PowerShell gotcha:** a `$` inside a **double-quoted** argument is interpolated as a variable. `-m "Raise to $6.95"` silently becomes `Raise to .95`, and `eas update --message "... $6.95 ..."` fails outright with *"The variable '$6' cannot be retrieved."* **Use single quotes** for any message containing a `$`.

### 3. Publish to the sandbox

```
npx eas update --branch preview --message 'What changed'
```

### 4. Verify on a tester phone

Force-close the app **twice** — the first launch downloads the update, the second applies it.

Then check the **build stamp at the bottom of Settings**: `v1.0.0 · preview · update <id>`. The id must have changed. If it reads `update embedded`, no OTA has ever applied to that device and everything you are about to test is meaningless.

### 5. Promote to production

Only after step 4 passes:

```
npx eas update --branch production --message 'What changed'
```

Once there are real users, start small and ramp:

```
npx eas update --branch production --rollout-percentage=5 --message 'What changed'
npx eas update:edit     # raise the percentage once Sentry is quiet
```

Rollout selection is **random** — you cannot guarantee a specific tester lands in the first 5%. It limits blast radius; it is not a substitute for step 4.

### 6. If it goes wrong

```
npx eas update:rollback
```

Interactive: re-publish a previous update, or drop clients back to the bundle embedded in the build. **Rehearse this once now**, not the first time production is broken.

---

## B. Native change (new build)

Anything touching `app.json`, native modules, permissions, or URL schemes.

```
npm test
git add -A && git commit -m '...' && git push
npx eas build --profile production --platform ios
npx eas submit --platform ios --latest
```

Then TestFlight → testers verify → submit for review → release. Review is the natural gate here; there is no way to rush it, so batch native changes rather than shipping them one at a time.

**Currently queued for the next native build (S2):** `tiktok`, `venmo`, `paypal` added to `ios.infoPlist.LSApplicationQueriesSchemes`. Already committed — it rides along on the next build. Nothing depends on it; the Venmo deep link works over the air today.

For device testing without TestFlight, use the `preview` profile (standalone, internal distribution, no Metro — Norton blocks LAN and tunnels are unreliable):

```
npx eas build --profile preview --platform ios
```

The old app must be **deleted** before installing a new preview build, or iOS keeps running the old one. This does not apply to OTA updates.

---

## C. Backend change

Edge Functions and SQL are **not** carried by an app update. Deploy them separately, and deploy them **before** the app update that depends on them.

```
npx supabase functions deploy send-reminders
```

SQL and RLS changes go through the Supabase SQL editor. Anything that changes a shape the app reads — a column, a policy — should go out first, so an older app version never meets a newer schema it cannot handle.

---

## The gap worth closing before launch

There is **one Supabase project** (`mtfyekdxtkdiaqbgaoza`). Tester accounts, tester acts, and tester feedback write to the same tables real users will.

That is fine today. Once there are real users it means:

- A tester running a 30-day cycle is putting fake data in production.
- A schema change you are trying out affects everyone immediately.
- Resetting a tester (`supabase/scripts/reset-tester.sql`) is a live-database operation.

A second Supabase project for staging is the real sandbox. It is more work than the update channels — new project, schema migration, a second set of keys selected by build profile — so it is a decision to make deliberately, not something to discover mid-incident.

---

## Pre-release checklist

Before the first App Store submission:

- [ ] **CO-1 fee** — $15, Tracking # 2026105449, Charitable Trust Filing System → My Filings → "$" icon. 30-day clock started 8/17, so **due ~9/16**.
- [ ] **Venmo charity profile** — payments to `@Actsofkindness30` were refused with *"You can't donate to this charity right now."* This is Venmo-side, not the app. The deep link hands donors a working pay sheet the moment the account clears.
- [ ] **Real-phone SMS reminder delivery** — never proven end to end. Not the (555) test numbers. Set a time ~10 minutes out with a ZIP filled in (a missing timezone silently blocks reminders) and wait; `pg_cron` fires every 5 minutes.
- [ ] **David's Day 30 → Day 31** run, including certificate and share buttons.
- [ ] **Tyler's** feedback round.
- [ ] **S2 native build** with the URL schemes.
- [ ] Rehearse `eas update:rollback` once.

---

## Quick reference

- **Project:** `C:\Users\Gary Laptop\Documents\30-Acts-current` · repo `gguttman-ui/30-Acts`
- **Supabase:** `mtfyekdxtkdiaqbgaoza` · **EAS:** `@garywg/30-acts-of-kindness`
- **iOS:** ASC App ID 6762151038 · bundle `org.30actsofkindness.app` · team JMY3RHV7MA
- **Build 96 (iOS)** · runtime `1.0.0` · channels: `production` (TestFlight + App Store), `preview` (internal), `development`
- **Build stamp:** bottom of the Settings screen — `v<runtime> · <channel> · update <id>`. First thing to check when a change "isn't working."
- **See users:** in-app Admin → Users, or the Supabase SQL editor.
