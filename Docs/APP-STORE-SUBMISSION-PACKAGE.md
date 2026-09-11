# App Store submission package — 30 Acts of Kindness

**Wednesday, September 2, 2026**

Everything you need to paste, plus the order to do it in. Companion to
`SUBMISSION-AND-TEST-ENV.md`, which explains *why* each piece matters.

---

# The moderation question — ANSWERED 2026-09-02

I traced every path that stores or shows user-authored content. The answer is
good, and the review notes below are written to match it.

**No user can see another user's content anywhere in the app.**

| Content | Who can see it |
|---|---|
| Acts, stories, photos | The author only |
| Custom acts (`user_custom_acts`) | The author only — the query filters on their own phone number |
| Act suggestions (`act_suggestions`) | Staff only, in a queue, until a person approves or rejects |
| Kindness tree | A *count* of a team's acts. Never the acts themselves |
| Admin / Reviewer screens | Staff only |

So **Guideline 1.2's report-and-block requirements do not apply.** Those exist
for apps where users consume each other's content; there is nothing here for one
user to report about another, and nobody to block. Sharing an act to Messages or
Instagram is a person exporting their own words to their own accounts — the same
as a screenshot, and not something Apple asks you to moderate.

Better still, anything user-written that could ever reach other people — an act
suggestion becoming part of the shared library — passes a **human approval**
first. Pre-moderation is the strongest position under 1.2.

**Admin "delete a user" is a bonus, not the answer** to 1.2. It is a tool for
you, not a control for users. Keep it; it just is not what that guideline asks
about.

## What was fixed to make this true (2026-09-02)

The filter existed but did not cover the screen that matters most:

| Screen | Field | Before | Now |
|---|---|---|---|
| `MyStoryScreen` | the act story | **unscreened** | screened |
| `CreateNewActScreen` | custom act title | **unscreened** | screened |
| `SuggestActScreen` | act suggestion | **unscreened** | screened |
| `DailyActScreen` | title + story | screened | unchanged |
| `SettingsScreen` | display name | screened | unchanged |

My Story is where people actually write now, so the main user-authored field in
the app was going into the database unchecked — while these notes were about to
tell Apple that submitted text is filtered. It is now true.

`__tests__/moderationCoverage.test.js` fails if any screen that stores typed
text stops calling the filter.

The filter fails **open**: a flaky connection never blocks someone recording a
genuine act. A local wordlist catches the obvious cases instantly with no
network at all.

### And a defect that widening the filter exposed — fixed the same day

Every banned word used to be matched as a plain **substring**. That was
tolerable while the filter only ran on the retired DailyAct screen and on
display names. Applied to the story field every user writes in every day, it
rejected real acts of kindness:

| Story | Rejected because of |
|---|---|
| I bought grapes for my neighbour | `rape` |
| I changed my attitude and apologised | `tit` |
| I signed a petition for the food bank | `tit` |
| I scraped ice off a stranger's car | `rape` |
| I read Dickens to my grandmother | `dick` |
| I fed the peacock at the sanctuary | `cock` |

A false positive here is worse than a false negative. Stories are private, and
anything that could ever reach another person is human-approved first — so
nothing slips past this list into public view. But a rejected story tells a
person their act of kindness contains language that is "not allowed".

The list is now in two parts: **stems** that occur inside no innocent English
word (`fuck`, `masturbat`, …) still match anywhere, so inflections need no
listing; **ordinary words** that do occur inside innocent ones (`tit`, `rape`,
`cock`, `ass`, …) match only as whole words plus the usual suffixes. `breast`
came off the list entirely — "I walked for breast cancer research" is a
plausible act of kindness.

All 183 acts in the catalogue pass. `__tests__/moderationWordlist.test.js`
holds 24 clean sentences and 17 that must still be blocked.

---

# SUBMITTED — Thursday 3 September 2026, 7:28 PM CDT

**iOS App 1.0 · build 1.0.0 (97) · Waiting for Review.**

| | |
|---|---|
| Availability | **United States only** — the app is US-only underneath; see backlog item 14 |
| Price | Free |
| Release | **Manual** — approval does not publish; you press Release This Version |
| Age rating | 4+ |
| Reviewer account | `5550100100` / `123456`, verified on build 97 itself before submitting |
| Category | Health & Fitness (Lifestyle is the better fit — changeable any time) |

Three late blockers App Store Connect raised, for next time: a **price tier**
must be chosen before Add for Review works; a **regulated medical device**
declaration is required (answer No — it is triggered by the Health & Fitness
category); and the **Build** section does not appear on the version page until
a binary has actually been uploaded, which confuses the order of the steps.

**While it is in review:** do not publish an `eas update` to `production`, and
do not edit metadata. Preview updates for testers are fine.

---

# Part 1 — The steps, in order

### 1. Finish the blockers from the other document

- `app_metrics.downloads` → NULL
- Decide on the seeded test accounts in the Growth metrics
- Age rating questionnaire answered in App Store Connect (this blocks the form)
- ~~Confirm the moderation question~~ — answered above, and the gap it found is fixed

### 2. Verify the reviewer account works

Fresh install, sign in as `+1 555 010 0100` with code `123456`. If that fails,
nothing else matters.

### 3. Build for production — not preview

```powershell
cd "$HOME\Documents\30-Acts-current"
npm test
eas build --platform ios --profile production
```

The channel is baked in at build time. A preview-channel build in the App Store
would receive your tester updates.

### 4. Upload

```powershell
eas submit --platform ios --latest
```

### 5. Fill in App Store Connect

Everything in Part 2 below. The Notes for Review are the part people skip and
the part that decides this.

### 6. Submit for review, then leave it alone

Do not publish an OTA update to `production` while the build is in review — the
reviewer may be looking at a different version than you think.

---

# Part 2 — Paste-ready content

## A. Notes for Review

> Paste this whole block into **App Review Information → Notes**. Every claim
> in it has been checked against the code, including the moderation paragraph.

```
REVIEW ACCOUNT — PLEASE READ FIRST

Sign-in uses a US phone number and a one-time SMS code. A reviewer cannot
receive our SMS, so please use the review account below, which bypasses SMS:

    Phone number:  5550100100
    Verification code:  123456

Steps: open the app, enter the phone number, tap Continue, then enter 123456
when asked for the code. No SMS will arrive and none is needed.

A second blank test account is available if you would like to see the
first-run experience: 5550100142, code 123456.

WHAT THE APP DOES

30 Acts of Kindness is a free daily-habit app from 30ActsofKindness NFP, a
registered 501(c)(3) nonprofit in Illinois (EIN 41-4058016). A user picks a
kind act, does it, and records it with a short story or a photo. Completing
30 consecutive days earns a shareable certificate.

NO IN-APP PURCHASES, AND NO DONATIONS COLLECTED IN THE APP

The app is free and contains no in-app purchases or subscriptions.

Donations are not collected inside the app. The Donate screen opens PayPal in
Safari, or copies a Zelle address to the clipboard, so all funds are collected
outside the app in line with Guideline 3.2.2(iv). We are not fundraising
in-app under 3.2.1(vi) and do not present an in-app payment sheet.

The optional "Kindness bracelet" is a PHYSICAL item posted to the user's
mailing address. The $6.95 is shipping and handling, paid outside the app via
PayPal or Zelle. No digital content, feature or subscription is unlocked by
it.

USER CONTENT AND MODERATION

Acts, stories and photos are private to the user who created them. No user can
view another user's content anywhere in the app. The Tree screen shows only a
numeric count of acts by people a user invited, never their content.

Submitted text is nevertheless screened by an automated content filter before
it is saved, and objectionable content is rejected.

Contact for any content concern: info@30actsofkindness.org, and there is a
Feedback tab inside the app.

ACCOUNT DELETION

Settings → Delete My Account. It asks the user to type a confirmation, then
permanently deletes the account and its content.

PERMISSIONS AND WHEN THEY ARE ASKED FOR

  Microphone / Speech Recognition — only when the user taps the mic to dictate
    a story. Typing is always available instead.
  Photo Library (add only) — only when the user chooses to save a share image
    to their camera roll before posting it. The app does not read the user's
    photo library and does not collect photos or videos.
  No location permission is requested. A ZIP code is typed at signup and is
    used only to set the user's time zone for daily reminders.

SMS REMINDERS

Optional daily reminders are sent by SMS via Twilio, only after the user
enables them and gives express consent on the reminder screen. STOP replies
are honoured.

THIRD-PARTY SERVICES

  Supabase — database and authentication
  Twilio — SMS reminders (opt-in only)
  Sentry — crash and error reporting
  Branch — invite-link attribution
  Meta SDK — used only for the Facebook share sheet; app event logging and
    advertiser ID collection are both disabled

Thank you for reviewing. Any questions: gguttman@compuserve.com
```

## B. App Privacy questionnaire — COMPLETED AND PUBLISHED 2026-09-02

Ten data types, every one *Used for App Functionality* and *Linked to the
user's identity*, none used for tracking: Name, Phone Number, Physical Address,
Coarse Location, Customer Support, Other User Content, User ID, Crash Data,
Performance Data, Other Diagnostic Data.

Two traps worth remembering if this is ever re-done. The identity question
defaults in a way that leaves rows reading only "Used for App Functionality" —
every row must also say "Linked to the user's identity". And **"Other Data"**
at the foot of the checklist is a catch-all, not a place to put a type you
cannot find; Customer Support lives inside *User Content*, and Performance Data
and Other Diagnostic Data sit directly under Crash Data in *Diagnostics*.


App Store Connect asks per data type: is it collected, is it linked to the
user, and is it used for tracking. **Nothing in this app is used for tracking**
— the Meta SDK has `autoLogAppEventsEnabled` and
`advertiserIDCollectionEnabled` both set to false.

| Data type | Collected | Linked to user | Tracking | Purpose | Where it comes from |
|---|---|---|---|---|---|
| Phone number | Yes | Yes | No | App Functionality | Sign-in identity |
| Name | Yes | Yes | No | App Functionality | Profile, certificate |
| Physical address | Yes | Yes | No | App Functionality | Only if a bracelet is ordered |
| Coarse location | Yes | Yes | No | App Functionality | ZIP at signup → time zone |
| Photos or videos | **No** | — | — | — | See below — the attach-a-photo path is no longer reachable |
| Audio data | **No** | — | — | — | Dictation is transcribed on-device by iOS; no audio is stored or sent |
| User content (other) | Yes | Yes | No | App Functionality | Act stories |
| Customer support | Yes | Yes | No | App Functionality | The Feedback tab — message, rating, account id |
| Crash data | Yes | Yes | No | App Functionality | Sentry |
| Performance data | Yes | Yes | No | App Functionality | Sentry |
| Other diagnostic data | Yes | Yes | No | App Functionality | Sentry — includes IP address, because `sendDefaultPii` is on |
| Identifiers (User ID) | Yes | Yes | No | App Functionality | Supabase user id, Branch invite attribution |

Everything else — payment info, browsing history, contacts, search history,
health, financial info, advertising data — is **not collected**. You never see
a card number: PayPal and Zelle handle payment entirely outside the app.

> **Photos: checked 2026-09-02, and the answer changed.** The attach-a-photo
> feature lives in `DailyActScreen`, and nothing routes to that screen any
> more — My Story replaced it. `ImagePicker` is imported nowhere else, so no
> shipping path opens the camera or reads the photo library. The app does
> *write* one image to Photos, the share card you save when posting to X or
> Instagram, but writing is not collecting.
>
> So **Photos or Videos is No**, and Audio Data stays No as well (dictation is
> transcribed on-device; no recording is stored or sent).
>
> `app.json` still declares `NSCameraUsageDescription` and
> `NSPhotoLibraryUsageDescription` for that dead path. Leave them for this
> submission — removing a permission key that unreachable code still calls is
> how you get a crash on the one path you were wrong about. It is a backlog
> item, not a blocker: unused purpose strings are never shown to a user and
> are not a rejection.

> Double-check the Sentry row against your privacy policy. `sendDefaultPii: true`
> means IP addresses reach Sentry, and you decided on 31 August to keep it. The
> policy should say so.

## C. Listing copy — drafts to edit, not to paste blind

**Subtitle** (30 characters max) — this is exactly 30, so paste it as-is:
```
One kind act a day for 30 days
```

**Promotional text** (170 max, changeable without a new build):
```
Start today. Pick one kind act, do it, and write down what happened. Thirty days later you'll have a habit — and a certificate to prove it.
```

**Keywords** (100 characters, comma-separated, no spaces after commas):
```
kindness,habit,gratitude,daily,challenge,good deeds,wellbeing,journal,streak,volunteer,charity,giving
```
*(That is 104 characters — drop `volunteer` to fit.)*

**Description**:
```
Kindness is a habit. This app helps you build it, one day at a time.

30 Acts of Kindness gives you a simple daily challenge: do one kind thing,
then take a moment to record it. Pick from a library of over 150 ideas
sorted by how much time and money they take — from a one-minute compliment
to an afternoon helping a neighbour — or write your own.

HOW IT WORKS

• Choose an act that fits your day
• Do it
• Write a sentence or two about what happened, or dictate it out loud
• Watch thirty days fill in, one square at a time

WHAT YOU GET

• A library of 150+ acts across eight categories
• Optional daily reminders, at times you choose
• A private journal of every act you have completed
• A shareable card for each act, with your own invite code
• A Certificate of Kindness when you complete all thirty days
• A kindness tree that grows as friends you invite join in

PRIVATE BY DEFAULT

Your acts, stories and photos are yours. Nobody else in the app can see them.
Share an act only if you choose to, to the people or places you choose.

FREE, AND FROM A NONPROFIT

30 Acts of Kindness is free, with no in-app purchases and no ads. It is made
by 30ActsofKindness NFP, a registered 501(c)(3) nonprofit (EIN 41-4058016).
Donations are entirely optional and are never collected inside the app.

Thirty days. Thirty acts. One kinder corner of the world.
```

**What's New** (first release):
```
The first release of 30 Acts of Kindness. Thank you for being here at the start.
```

## D. URLs and details to have to hand

| Field | Value |
|---|---|
| Support URL | https://30actsofkindness.org |
| Marketing URL | https://30actsofkindness.org |
| Privacy Policy URL | https://30actsofkindness.org/privacy.html |
| Copyright | 2026 30ActsofKindness NFP |
| Primary category | **Lifestyle** (secondary: Health & Fitness) |
| Bundle ID | org.30actsofkindness.app |
| SKU | EX1776105697264 |
| Apple ID (ascAppId) | 6762151038 |
| Apple Team ID | JMY3RHV7MA |
| Content Rights | No third-party content |
| License Agreement | Apple's standard EULA |
| Age rating | 4+ — confirmed in App Store Connect, 2026-09-02 |

> Confirm the privacy URL resolves — the site uses `.html` filenames, so check
> the exact path in a browser before pasting it.

## E. Screenshots

Required for **6.9"** (iPhone 16 Pro Max or similar) and **6.5"**. Everything
else is optional; App Store Connect scales down.

Six that tell the story in order:

1. The calendar with a healthy streak of green ticks
2. Choosing an act from the library
3. Writing a story, mic visible
4. The share card with the QR code
5. The Certificate of Kindness
6. The kindness tree

Take them on a real device with realistic content — no "asdf" test acts. This
is the same rule as the review build: placeholder content is a 2.1 rejection.

---

# Part 3 — After you press Submit

- Do not push an OTA to `production` while it is in review
- Use the review time to stand up the staging Supabase project — see
  `SUBMISSION-AND-TEST-ENV.md`, Part 2
- Expect a day or two. If rejected, the reason is almost always fixable in
  metadata rather than code

---

## Sources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 1.2 (UGC), 2.1 (completeness), 3.2.1(vi) and 3.2.2(iv) (nonprofit fundraising), 5.1.1(v) (account deletion)
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) — Xcode 26 / iOS 26 SDK since 28 April 2026; age rating deadline 31 January 2026
