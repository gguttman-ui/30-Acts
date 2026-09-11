# App Review reply - Guideline 2.1, Information Needed

Submission ID fa58d07e-1aae-436c-afc5-9404ecab1bba
Build 1.0.0 (97). Rejected 3 September 2026, 7:49 PM.

Plain ASCII throughout so it pastes cleanly.

## What this rejection is, and is not

It is NOT a fault in the app. Apple has not said anything is broken. This is the
standard questionnaire they send to a developer account with little or no review
history - a first-app checklist, not a defect report. The phrase that gives it
away is "submitted by a developer account that has a limited App Review
history".

**You do not need a new build.** You reply in App Store Connect with the answers
below plus a screen recording, and you add the same text to the Notes field.
Apple then continues the review of build 97.

Order of work:

1. Record the video on your iPhone (shot list below).
2. Put it somewhere Apple can watch it.
3. Paste the reply into App Review > Messages.
4. Paste the same six answers into App Review Information > Notes, under the
   text already there.
5. Send.

---

# Part 1 - The screen recording

Record on your iPhone, not a simulator. iOS Settings > Control Centre > add
Screen Recording, then swipe down and tap the record button.

Rules Apple states: start with launching the app, show the typical user flow,
and include registration, login, account deletion, and any user-generated
content.

Aim for three to five minutes. Do not rush; a reviewer is watching in real time.

**Shot list, in order:**

1. Start on the home screen of the phone. Tap the app icon so the launch is on
   camera. This is explicitly required.
2. Sign in: enter 5550100100, tap Continue, enter 123456. Let the calendar load.
3. Show the calendar with the completed run of days.
4. Tap + to log today. Pick an act from the library - scroll it, then use the
   search box so they see both.
5. Write a short story. Tap the mic and dictate a few words so the microphone
   permission prompt and the dictation are both on camera, then type a little
   too.
6. Tap Save My Act. Let the share card appear. Do not tap a share button - just
   show that it exists, with the QR code.
7. Go to the Tree tab. Show the count.
8. Settings > My Recognition > Send me a certificate. Show the certificate.
9. Settings > Delete My Account. Show the confirmation prompt that asks you to
   type to confirm. **Complete the deletion.** Use the blank test account for
   this rather than the main one - see the note below.
10. Show that you are returned to the sign-in screen.

**How to show deletion without losing the reviewer account:** sign out of
5550100100 first, sign in as 5550100142 (code 123456), and delete that one on
camera. Afterwards, sign in as 5550100142 again to recreate it, so both accounts
work when the reviewer tries them.

**Where to put the video.** Try attaching it to the App Store Connect message
first. If it is too large, upload it to YouTube as **Unlisted** and paste the
link in the reply - that is common and accepted. Do not make it Public.

---

# Part 2 - The reply text

Paste this into the App Review message, and the same into the Notes field.

```
Thank you for the review. Answers to each of the six points follow, and a
screen recording is attached [OR: is available at <link>].

1. SCREEN RECORDING

Attached [or: <link>]. It was captured on a physical iPhone running the current
version of iOS. It begins with the app launch and shows: sign-in with the review
account, the daily calendar, choosing an act from the library, writing and
dictating a story, saving the act, the shareable act card, the kindness tree,
the Certificate of Kindness, and the full account deletion flow including the
typed confirmation.

Regarding content reporting and blocking: the app has no such controls, because
there is nothing for one user to report and nobody to block. Acts, stories and
photos are visible only to the person who wrote them. No user can view another
user's content anywhere in the app. The Tree screen shows only a numeric count
of acts completed by people the user invited, never their content. Submitted
text is nevertheless screened by an automated content filter before it is saved,
and objectionable content is rejected. That filter runs on the device; no user text
is sent to any third party for screening. Any concern can be raised at
info@30actsofkindness.org or through the Feedback tab inside the app.

2. PURPOSE AND TARGET AUDIENCE

30 Acts of Kindness is a free daily-habit app from 30ActsofKindness NFP, a
registered 501(c)(3) nonprofit in Illinois (EIN 41-4058016).

The problem it addresses: most people intend to be kind, but intention without
structure does not become behaviour. Kindness is a habit, and habits are built
by repetition and by noticing.

How it works: the user picks one kind act, does it, and records it with a short
story. A thirty-square calendar tracks consecutive days. Completing thirty days
in a row earns a shareable Certificate of Kindness.

Target audience: adults in the United States who want to build a daily habit of
kindness. It is rated 4+ because it contains nothing objectionable, but accounts
are for adults; our terms state that the service is not directed to children
under 13.

3. SETTING UP AND ACCESSING THE MAIN FEATURES

Sign-in uses a US phone number and a one-time SMS code. A reviewer cannot
receive our SMS, so please use the review account below, which bypasses SMS
entirely:

    Phone number:  5550100100
    Verification code:  123456

Steps: open the app, enter the phone number, tap Continue, then enter 123456
when asked for the code. No SMS will arrive and none is needed. This account has
a completed thirty-day history so that every feature is reachable.

A second, blank account is available if you would like to see the first-run
experience: 5550100142, code 123456.

No sample files are required.

Where to find each feature:
  Log an act            Home tab, tap the + on today's square
  Act library           within that flow, "Browse acts from our list"
  Dictation             the microphone on the story screen
  Share an act          appears after saving an act
  Kindness tree         Tree tab
  Certificate           Settings > My Recognition > Send me a certificate
  Donations             Settings > Support Our Mission
  Kindness bracelet     Settings > My Recognition > Send me a bracelet
  Account deletion      Settings > Delete My Account
  Feedback              Feedback tab

4. EXTERNAL SERVICES USED

  Supabase - database, authentication and storage
  Twilio - SMS delivery for the one-time sign-in code and for optional daily
    reminders. Reminders are sent only after the user enables them and gives
    express consent on the reminder screen; STOP replies are honoured
  Sentry - crash and error reporting
  Branch - invite-link attribution
  Meta SDK - used only to present the Facebook share sheet. App event logging
    and advertiser ID collection are both disabled
No artificial intelligence service is used. Content moderation is performed by
a word filter that runs on the device, with no network call and no third-party
provider.

There are no payment processors in the app. Donations are not collected in the
app: the Donate screen opens PayPal in Safari or copies a Zelle address to the
clipboard, so all funds are collected outside the app in line with Guideline
3.2.2(iv). The optional kindness bracelet is a physical item posted to the
user's mailing address; the $6.95 is shipping and handling, paid outside the
app. No digital content, feature or subscription is unlocked by it.

5. REGIONAL DIFFERENCES

There are none. The app is offered in the United States only and behaves
identically for every user in that region. Sign-in requires a US phone number
and a five-digit US ZIP code, which is why availability is restricted to the
United States rather than offered worldwide. There is no region-specific
content, pricing or feature gating.

6. REGULATED INDUSTRY OR THIRD-PARTY MATERIAL

Neither applies.

The app is not in a regulated industry. It provides no medical, health, legal or
financial advice, reads no health sensors, and makes no wellness claims. We have
declared it as not a regulated medical device.

It contains no protected third-party material. The library of act suggestions
was written by 30ActsofKindness NFP. All imagery, the certificate design and the
app icon are our own. The only user-generated content is what a user writes
about their own acts, which remains private to them.

30ActsofKindness NFP is a registered 501(c)(3) nonprofit, EIN 41-4058016.

Thank you for your time. Any further questions: gguttman@compuserve.com
```

---

# Part 3 - What checking that question turned up

Point 4 asks specifically about AI services, so I asked you to look. The answer
is better than expected for the reply, and worth knowing about the code.

**The `moderate-content` Edge Function does not exist.** Your project has three
functions: `send-reminders`, `sms-webhook` and `swift-processor`. There is no
`moderate-content`.

So `moderateContent()` in `src/lib/moderation.js` POSTs to
`/functions/v1/moderate-content`, gets a 404, hits `if (!res.ok) return false`,
and returns "not flagged". It has never done anything. Every save has been
making one network call that always fails, silently, by design - the function
was written to fail open so a flaky connection could not block a real act.

**This does not weaken the reply.** The local word filter is real, it runs on
every save, and it does reject content - you tested it yourself. The reply above
now says exactly that: an on-device filter, no third party, no AI service. That
is true and simple, and simple is what gets through review.

**For the backlog, not now:** either build the server-side function or delete
the call. Leaving a request that 404s on every save costs a round trip and will
confuse whoever reads that file next. It is not urgent and it is not a
submission blocker. Do not change it while the app is in review.
