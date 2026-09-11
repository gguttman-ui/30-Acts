# Submitting to the App Store, and testing after you're live

**Wednesday, September 2, 2026**

Two separate jobs. Part 1 is what has to be true before you press Submit. Part 2
is the thing that has to exist *before* the app is live, because after launch a
mistake reaches real people with nothing in between.

---

# Part 1 — Before you submit

## A. The two most likely rejections

Everything else on this list is routine. These two are where this particular app
is exposed, so deal with them first.

### 1. The reviewer cannot log in

Sign-in is a phone number and an SMS code. An App Review tester in California
cannot receive your SMS. Without a way in they see a login screen, cannot
proceed, and reject under Guideline 2.1 — the single most common rejection
there is.

You already built the way in. **It must be in the Notes for Review, spelled
out:**

```
Sign-in uses a US phone number and a one-time SMS code, so please use the
review account below — it bypasses SMS entirely.

    Phone:  +1 555 010 0100
    Code:   123456

Enter the phone number, tap Continue, then enter 123456 when asked for the code.
```

Test that account yourself on a fresh install the day you submit. If it has
drifted, you find out now rather than in a rejection.

### 2. Donations and the $6.95 bracelet

Apple's rules here are specific, and an app that opens PayPal can be misread as
dodging in-app purchase.

What the guidelines actually say:

- **3.2.2(iv)** — an app raising money for a charity must be **free**, and may
  **only collect funds outside the app**, "such as via Safari or SMS."
  That is exactly what you do: the Donate screen opens PayPal or copies a Zelle
  address. Nothing is collected inside the app. **You are on the compliant
  path.**
- **3.2.1(vi)** — an *approved nonprofit* may fundraise **inside** its own app,
  but only with **Apple Pay support**, disclosure of how funds are used, and
  tax receipts. You are not doing this, and should not start without going
  through Apple's nonprofit approval first.
- The **bracelet** is a physical item posted to a real address. Physical goods
  are explicitly outside in-app purchase, which is the strongest possible
  footing — as long as the reviewer understands it is a physical thing and the
  $6.95 is shipping.

**Say all of this in the Notes for Review**, because the reviewer will not infer
it:

```
30ActsofKindness NFP is a registered 501(c)(3) nonprofit (EIN 41-4058016).

The app is free and contains no in-app purchases. Donations are not collected
in the app: the Donate screen opens PayPal in Safari, or copies a Zelle address
to the clipboard, per Guideline 3.2.2(iv).

The Kindness bracelet is a physical item shipped to the user's postal address.
The $6.95 is shipping and handling, paid outside the app, and no digital
content or feature is unlocked by it.
```

## B. App Store Connect — the paperwork

- [ ] **Age rating questionnaire.** Apple replaced these questions and required
      every developer to answer by 31 January 2026. Until you do, submissions
      are interrupted. Do this before anything else — it blocks the form.
- [ ] **App Privacy questionnaire.** Be honest and complete; mismatches get
      caught. This app collects, at minimum:
      phone number (account), name, photos and video (act proof), coarse
      location (ZIP at signup), user content (act stories), and diagnostics
      (Sentry, including IP address — `sendDefaultPii` is deliberately on).
- [ ] Screenshots for every required device size
- [ ] Description, keywords, promotional text, category
- [ ] **Support URL** and **Marketing URL** — must load
- [ ] **Privacy Policy URL** — 30actsofkindness.org/privacy.html, and it must
      also be reachable *inside* the app (it is: Settings → Legal & Policies)
- [ ] Export compliance — already handled in `app.json`
      (`ITSAppUsesNonExemptEncryption: false`), so you should not be asked

## C. Things reviewers of *this* app will look for

It is a user-generated-content app, so Guideline 1.2 applies and they will check
for the moderation tools. You built them; make them easy to find:

```
This app includes user-generated content (act stories, photos). Moderation:
  • Objectionable content is filtered on submission.
  • Every act has a Report control.
  • Users can block and unblock other users.
  • Contact: info@30actsofkindness.org
Account deletion is in Settings → Delete My Account, and removes the account
and its content.
```

**Account deletion is a hard requirement** and a frequent rejection. Yours is in
Settings. Say where it is; do not make them hunt.

## D. Data and code

- [ ] **`app_metrics.downloads` back to NULL.** It is `1234` from testing. Ship
      it as-is and your Admin screen tells you a lie on day one.
      ```sql
      UPDATE public.app_metrics SET value = NULL, updated_at = now()
      WHERE key = 'downloads';
      ```
- [ ] **Seeded test accounts.** Growth metrics currently read `signins` 11,
      `did_one_act` 9, `streak_30` 2 — all fake. Either delete the test
      completions or filter the test phone numbers inside
      `admin_growth_stats()`. Decide now; the numbers are meaningless until you
      do.
- [ ] **Build with the `production` profile**, not `preview`. Channel is baked
      in at build time. `eas build --platform ios --profile production`.
- [ ] `npm test` green, and the build stamp in Settings reads what you expect.

## E. One upload gate that has nothing to do with your code

Since **28 April 2026**, App Store Connect only accepts builds made with
**Xcode 26 / the iOS 26 SDK**. EAS handles this for you, but if an upload is
rejected before review even starts, this is why — the fix is a current EAS build
image, not a change to the app.

## F. Still outstanding from before

- [ ] **CO-1 $15 fee**, due around 9/16
- Venmo is hidden (one line in `DONATIONS`), so nothing broken ships
- The mic bug is David-only and unreproducible elsewhere — see backlog item 13.
  It is not a submission blocker

---

# Part 2 — A test environment for after launch

## Why this is urgent rather than nice to have

Right now every tester build and the App Store build talk to **the same Supabase
database**. Today that is fine, because the only users are you and David. The
day real people sign up it stops being fine:

- A tester completing acts writes rows into the same table your Growth metrics
  count.
- A tester triggering reminders sends **real SMS to real numbers**.
- A bad migration tested against that database is tested against your users'
  data.
- Sentry reports every preview build as `environment: production`, so a
  tester's error and a real user's error look identical.

And the sharpest edge: once you are live, `eas update --branch production`
reaches every real user **immediately**, with no gate. That is already written
up in `RELEASE-WORKFLOW.md`, and it is only survivable if testers are somewhere
else.

## The three separations, in the order worth doing them

### 1. Channels — already correct, just don't break it

`eas.json` is right: `preview` and `production` are distinct channels, and a
build's channel is fixed when it is built.

**The rule after launch:** every JavaScript change goes to `preview`, gets
verified on a real phone, and only then is promoted to `production`. Never
publish straight to production because it is only a small change. Small changes
are exactly what nobody re-reads.

Testers stay on internal-distribution `preview` builds. That much already works.

### 2. The database — the real work, and less work than it looks

This is backlog item 2, and the setup document is already written
(`SUPABASE-STAGING-SETUP-20260828.md` plus `staging-setup.ps1` on the Desktop).

**Good news found while writing this:** the app already reads its connection
from environment variables, with the live project only as a fallback —

```js
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_...';
```

So pointing testers at a staging database is an `eas.json` change, not a code
change:

```json
"preview": {
  "distribution": "internal",
  "channel": "preview",
  "env": {
    "SENTRY_DISABLE_AUTO_UPLOAD": "true",
    "EXPO_PUBLIC_SUPABASE_URL": "https://<staging-ref>.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<staging publishable key>"
  }
}
```

Two things to be careful about, both called out in the setup doc:

- The staging project needs its own `pg_cron` jobs, and **the riskiest single
  mistake is a staging cron job still pointed at the production Edge Function
  URL** — that would send real SMS from your test environment.
- Free-tier Supabase projects pause after about a week idle. Expect to wake it.

**This requires a new build**, because env vars are baked in at build time. It
cannot be OTA'd. So it wants doing at the same time as some other native change,
or on its own before the tester group grows.

### 3. Sentry environments — small, and worth it the day you launch

`Sentry.init` in `App.js` sets no `environment`, so everything reports as
`production` — including the preview build behind the app-hang alerts yesterday.
Once real users exist you will not be able to tell whose error is whose.

Set it from the channel at init, so preview builds report `preview`. Then the
Sentry issue list is worth reading again.

## What I would actually do, in order

1. **Before submitting:** nothing here. None of it blocks the submission.
2. **While the app is in review** (usually a day or two, and you cannot ship
   anyway): stand up the staging Supabase project. That is the long pole and
   review is dead time.
3. **The day it goes live:** set the Sentry environment and cut a fresh preview
   build pointing at staging. From then on testers never touch real data.
4. **Ongoing:** preview soak before every production update, without exception.

---

## Sources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 3.2.1(vi), 3.2.2(iv), 1.2, 2.1
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) — Xcode 26 / iOS 26 SDK since 28 Apr 2026; age rating deadline 31 Jan 2026
- [App Store Connect release notes](https://developer.apple.com/help/app-store-connect/release-notes/)
