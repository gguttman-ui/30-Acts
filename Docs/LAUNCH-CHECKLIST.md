# 30 Acts of Kindness - Launch Checklist

Written Tuesday, September 8, 2026.

Covers everything from "Apple approves" to "the last email is sent." Ordered so
that each step's prerequisites are already done. Plain ASCII throughout.

Companion documents: HANDOFF20260906.md for where things stand,
POST-LAUNCH-BACKLOG.md for work that waits until after launch.

---

## PART A - WHILE STILL WAITING

Everything here is safe with a reviewer possibly in the app. Nothing below
touches the live database, the production channel, or App Store Connect.

### A1. Contacts tidy-up

`contacts-named.csv` on the Desktop, 601 rows. Three jobs, all of which produce
new files rather than changing that one:

- [ ] **Collapse the 24 people who appear twice.** Multi-address contacts, one
      row per address. Send to the file as it stands and 24 people get the email
      twice.
- [ ] **Remove the ~19 corporate addresses** - jpmorgan.com (9),
      promontory.com (10). Old colleagues at old jobs. Most will bounce, and
      bounces are what get a sender flagged.
- [ ] **Split out the 168 legacy consumer addresses** - aol.com (63),
      yahoo.com (57), hotmail.com (27), earthlink.net, optonline.net,
      nyc.rr.com. Many are live, but they are the oldest addresses and AOL and
      Yahoo are the strictest about unfamiliar senders. These go in a LATER
      batch, never the first.

Output: `contacts-batch-01.csv` through `contacts-batch-NN.csv`, 50 to 75 rows
each, legacy domains at the back.

### A2. Decide the referral-tag question - READ THIS BEFORE MAKING THE QR

The invite mechanism uses the inviter's **phone number** as the referral tag.
`generateInviteLink()` builds a Branch link whose data carries `ref: <phone>`,
and the fallback URL is literally
`https://30ActsofKindness.org?ref=<your phone number>`.

**So a QR code on the public website that points at your personal invite link
publishes your phone number.** Anyone who inspects the Branch link or follows
the desktop fallback can read it. This is not a new bug - every act you have
ever shared to X or Facebook carries the same tag - but a QR on the front page
of the website is a different order of exposure.

**DECIDED 2026-09-08: use the Google Voice number.** An organisation account is
signed up on the Google Voice number and the website QR points at that account's
invite link. Gary's personal number stays out of the public link, and the tree
that grows from the website belongs to the organisation rather than to one
person - which is the right home for it, and hands over to David or a volunteer
without handing over a personal phone number.

The objection to this - that it splits the tree away from Gary's own account -
does not apply, because all current activity is being wiped at launch anyway.

**Twilio delivery to that number is CONFIRMED, 2026-09-08.** A test message sent
from the Twilio console to the Google Voice number arrived on the iPhone. The
remaining confirmation is a real sign-up through the app, in Part D.

**The long-term fix is still open:** change the referral tag from a raw phone
number to an opaque code. That is a code change and therefore a new build -
backlog item 22, after launch.

### A3. Prepare the website changes locally - DO NOT UPLOAD YET

The site is static, in the `website/` folder of the repo, deployed by uploading
to GoDaddy cPanel -> File Manager -> public_html.

- [ ] **Remove the waitlist form.** Keep the Supabase `waitlist` table and its
      rows - that list is your first email audience and must not be dropped.
      Only the form comes off the page.
- [ ] **Add a download section** with the App Store badge, a link, and the QR
      code.
- [ ] **Sign up the organisation account on the Google Voice number**, per A2.
      Do this after approval, alongside the data wipe, so it survives the wipe
      rather than being cleared by it.
- [ ] **Generate the QR** from that account's invite link. Get the link out of
      the app: share any act from the org account and copy the `airpa.app.link`
      URL from the caption, or use the invite/share flow directly. Test the QR
      with a phone camera before it goes near the site.
- [ ] **The App Store URL** will be `https://apps.apple.com/us/app/id6762151038`.
      Confirm the exact URL in App Store Connect after release rather than
      trusting this line.
- [ ] Note: `assets/paypal-qr.png` is a separate QR for donations. Do not
      confuse the two, and do not regenerate it - the donate link has not
      changed.

### A4. Check the Twilio throughput limit

Read-only, in the Twilio console. Every new user triggers an SMS one-time code.
A standard 10-digit long code sends about **one message per second**. Three
hundred people opening the email at lunchtime queues for minutes, and some codes
arrive after people have given up and closed the app.

- [ ] Find the actual per-second limit on the number in use.
- [ ] If it is one per second, that alone justifies the 50-to-75 batching, and
      the batches should be spaced by hours, not minutes.

### A5. Do NOT do any of these while waiting

- No `eas update` to the `production` branch
- No metadata edits in App Store Connect
- No resubmitting, no Cancel Submission, no removing the version from review
- No staging Supabase work - it needs a production password reset
- No touching the reviewer accounts 5550100100 / 5550100142
- No work on backlog items 15 or 17

---

## PART B - APPLE APPROVES, BEFORE PRESSING RELEASE

Status will read **Pending Developer Release**. Nothing is public yet. Take your
time here; this is the last quiet moment.

- [ ] **Confirm "Manually release this version" is still selected** on the
      version page. If it somehow flipped to automatic, the app is already out.
- [ ] **Move production Supabase to Pro**, in the **gmail** org
      (`mtfyekdxtkdiaqbgaoza`). Not the compuserve org - that is the mistake
      that cost $345 a year in reverse. This buys daily backups and the Micro
      compute IO headroom. Same $28.75 that was already being spent.
- [ ] **Confirm `app_metrics.downloads` is still NULL.** It must not read 1234
      on day one.
- [ ] **Confirm the growth-stats test filter is still in place** -
      `admin_growth_stats()` excludes the 555-010-xxxx range. Your baseline is
      not zero; roughly seven of those early numbers are you and David.
- [ ] **Have the website files ready to upload**, per A3, but do not upload yet.
      The App Store link in them does not work until the app is released.
- [ ] **Have the email batches ready**, per A1, but send nothing.

---

## PART B2 - THE DATA WIPE

Launch starts from a clean database. This is the ONLY irreversible step in the
whole launch, so it gets its own section and its own order.

**Do it after approval and after the Pro upgrade, before Release.**

### Take a backup first, whatever else happens

- [ ] Upgrade to Pro (B above) and confirm the first automatic backup exists,
      OR take a manual dump to the Desktop:
      ```powershell
      $env:Path += ";C:\Program Files\PostgreSQL\17\bin"
      pg_dump --no-owner --no-privileges -d $conn -f Desktop\pre-launch-backup.sql
      ```
      A dump costs ten minutes. Not having one costs everything.

### Enumerate before deleting

Nobody currently has a full list of the tables in production -
`supabase\prod-schema.sql` is still 0 bytes from the paused staging work.

- [ ] List every table first, and decide about each one explicitly:
      ```sql
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name;
      ```
      A wipe script written from memory is how something important goes.

### MUST SURVIVE - do not delete

- **`waitlist`** - the first email audience. Different project? No. Same
  database. It is one careless `TRUNCATE` away from gone.
- **The reviewer accounts**, 5550100100 and 5550100142, with their history.
  Version 1.1 will need a working demo account with 30 days again.
  `rebuild-reviewer-account.sql` can recreate them, but keeping them is free.
  They are already excluded from growth stats by `is_test_phone()`.
- **`sms_opt_outs`** - SEE THE WARNING BELOW. This one is not optional.
- **The act catalogue** (`acts_of_kindness`, ~183 rows) - reference data, not
  user activity. An empty app is not the goal.
- **`app_metrics`** - keep the ROW, with `downloads` NULL. Deleting the row may
  break the Admin tile that reads it.

### THE ONE THAT COULD ACTUALLY HURT YOU

**`sms_opt_outs` must not be wiped.** It records everyone who has replied STOP.
Deleting it means the app can text people who explicitly asked it not to. That
is a TCPA problem and a Twilio policy problem, not a data-tidiness problem, and
it is the kind of thing that costs a toll-free number its verification.

Nobody has opted out yet in any volume, which is exactly why it is easy to
forget. Keep the table and its rows.

### Also check before wiping

- [ ] **`sponsors` / `sponsor_members`** - if any real group exists, wiping it
      destroys their join code. Almost certainly test data only, but look.
- [ ] **Auth users vs profiles.** Deleting a `profiles` row without deleting the
      matching `auth.users` login leaves an account that can still sign in.
      Decide whether those logins are removed too, and in which order. The safest
      route is the same path `delete_my_account()` already uses rather than a
      hand-written DELETE.
- [ ] **Storage buckets.** `act-media` holds uploaded photos and `share-cards/`
      holds rendered cards, both public. Wiping the database but leaving the
      bucket leaves orphaned images live at their URLs. Clear them in the same
      pass.

### Goes

Completions, profiles and their logins, stories, suggested acts,
`recognition_orders`, feedback, and Gary's and David's own accounts - including
Gary's completed thirty days and certificate. Accepted deliberately: the launch
baseline should be a true zero.

### The testers are the only real people affected

There are no public users - nothing has ever been on the App Store. But five
testers have real accounts on real phones, and TestFlight builds point at the
same production database:

- David
- Ghenno
- Tyler
- Bridget
- Sina

- [ ] **Tell them before the wipe, not after.** David has had a run going. From
      their side an account that silently empties looks like a bug in the app
      they just spent weeks testing, and the first thing they will do is report
      it.
- [ ] **After the wipe, have each of them sign out and back in** - or delete and
      reinstall. Their phone is holding a login for an account that no longer
      exists, and an orphaned session with no profile row behind it is not a
      state anyone has tested.

**Draft note to the testers.** Send a day or two before the wipe, not the
morning of. Plain text, sent individually or with everyone in BCC.

---

Subject: One housekeeping thing before 30 Acts goes live

Hi <name>,

Short version: your 30 Acts account is going to be cleared in the next few days,
and that is deliberate.

We are close to launching on the App Store, and we want the app to open on day
one with a clean database - no test accounts, no seeded streaks, none of the
half-finished experiments we have been running since the spring. That means
everything currently in there goes, including your account and whatever acts you
have logged.

What that means for you:

- Your acts and stories will be gone. If any of them mattered to you, take a
  screenshot in the next day or two.
- After the wipe, please delete the app and reinstall it, or at least sign out
  and sign back in. Your phone is holding a login for an account that will no
  longer exist, and I would rather you got a clean start than a strange error.
- You will sign up fresh, exactly as a new user does. Which, frankly, is one
  more useful test.

I will let you know the moment it is done, and again the moment the app is
actually live.

Thank you for putting up with the builds, the force-closing, the "can you try
that again" messages, and the odd thing that only broke on your phone. The app
is in the state it is in because five people were willing to keep testing it.

Gary

---

### After the wipe

- [ ] **Sign up the organisation account on the Google Voice number.** It has to
      be created after the wipe or it gets cleared by it.
- [ ] **Generate its invite link and the website QR** from that account.
- [ ] **Confirm `admin_growth_stats()` returns zeros** apart from anything the
      reviewer accounts contribute - and they should be filtered out entirely.

---

## PART C - RELEASE

- [ ] Press **Release This Version**.
- [ ] Wait. It can take anywhere from fifteen minutes to a few hours for the app
      to appear on the App Store, and longer for search to index it. Do not
      panic in the gap, and do not send anything during it.

---

## PART D - VERIFY BEFORE TELLING ANYONE

This is the part most launches skip and then regret. Do all of it before a
single email goes out.

- [ ] **Find the app in the App Store** by name on a real phone.
- [ ] **Open `https://apps.apple.com/us/app/id6762151038`** and confirm it
      resolves to the listing. Copy the exact URL from that page for the emails
      and the website.
- [ ] **Install fresh on a device that has never had the app** - not an OTA
      update, a clean install from the store.
- [ ] **THE END-TO-END ATTRIBUTION TEST.** On that clean device, scan the
      website QR, install through it, sign up as a genuinely new user, then
      check your own Tree screen and confirm "People Under Me" went up by one.
      This is the only test that proves the whole chain - QR to Branch to
      deferred deep link to `referred_by` to `get_tree_stats()`. If it fails,
      the QR is decorative and the emails should wait.
- [ ] **Receive a real SMS code** on that signup. Not a 555 test account.
- [ ] **Log an act, write a story, save it.** Confirm it appears.
- [ ] **Upload the website changes** to GoDaddy public_html now that the link
      works. Then load the site on a phone and tap through to the App Store.

---

## PART E - THE EMAILS

Both drafts are in `launch-emails.md` on the Desktop. Both are plain ASCII and
both say iPhone only / US App Store / Android coming.

**The list is 549 addresses as of 2026-09-08**, trimmed from 601. Gary's plan is
two tranches.

- [ ] **Waitlist first.** They asked to hear about this. Pull the addresses from
      the Supabase `waitlist` table. Smaller, warmer, and a safe test of the
      wording before the big list.
- [ ] **Two tranches is a fine plan for DAYS. It is not a fine plan for
      MESSAGES.** 275 addresses in one BCC field, from a personal Gmail account,
      carrying a link, is the classic spam signature - and a large share of it
      lands in spam folders rather than bouncing, so you never find out. Keep the
      two tranches, but send each one as four or five messages of 55 to 65,
      spaced over a few hours.
- [ ] **Or use a real sending tool and skip the problem.** See the note below.
- [ ] **Order the list by how likely someone is to open it**, not alphabetically.
      People who know you well go in tranche one. Early opens from engaged
      recipients build the sending reputation that carries tranche two.
- [ ] **Your own address in To. Everyone else in BCC.** Never To, never CC - that
      publishes every one of your contacts' addresses to every other recipient.
- [ ] **Legacy consumer domains in the last batches**, per A1.
- [ ] **Watch the bounces after batch one.** A batch with heavy bounces means
      stop and clean, not send the next one faster.
- [ ] The contacts email invites Android users to say so. Keep those replies -
      that is your Android waitlist, free.

### Worth considering instead of Gmail BCC

Gmail BCC gives you no bounce tracking, no unsubscribe handling, and no
visibility into whether anything landed. For 549 addresses, most of them old,
that is flying blind on the one send that matters most.

- **Brevo** - free tier is 300 emails a day with unlimited contacts. That maps
  exactly onto two tranches, one a day, and gives real bounce reports,
  unsubscribe links and inbox placement built for bulk. Checked 2026-09-08;
  these tiers move, so confirm before relying on the numbers.
- **MailerLite** is out - its free tier dropped to 250 subscribers in June 2026.
- **Google for Nonprofits.** 30ActsofKindness NFP is a registered 501(c)(3), so
  it should qualify for Workspace at no cost - which raises the sending limits
  to 2,000 a day and gives you a `@30actsofkindness.org` address to send from.
  An email about a nonprofit's app, sent from the nonprofit's own domain, gets
  treated better by spam filters than the same text from a personal Gmail. Worth
  applying for regardless of the launch; approval takes time, so start early.

---

## PART F - THE FIRST WEEK

In priority order.

- [ ] **Backlog item 17 - the account-deletion gaps.** `recognition_orders`
      keeps a home address after deletion, and `act_title` survives. Close both
      before anyone orders a real bracelet. Highest priority on the list.
- [ ] **CO-1 $15 fee - due around 9/16.** A hard external deadline that has
      nothing to do with the app. Do not let launch week swallow it.
- [ ] **Resume the staging Supabase setup** - backlog item 2. Now that real
      users exist, testing against production stops being acceptable. Full
      instructions in HANDOFF20260903.md.
- [ ] **Sentry environments** - preview builds still report as `production`.
      Needs a build. Until it is fixed, a tester force-quitting and a real
      user's app dying look identical.
- [ ] **Backlog item 15** - the `moderate-content` edge function does not exist.
      Either build it or delete the call.
- [ ] **Update `app_metrics.downloads`** by hand once real numbers exist - App
      Store Connect, Sales and Trends, Units, lifetime. Weekly is plenty;
      Apple's figures settle over about 48 hours.
- [ ] **Watch Supabase disk IO and Sentry** daily for the first week.

---

## THE ONE RULE FOR LAUNCH WEEK

`eas update --branch production` reaches every real user immediately, with
nothing in between. Publish to `preview` and verify on a phone first, every
time. If something must go to production in a hurry, use
`--rollout-percentage` and have `eas update:rollback` ready - and rehearse that
command once before you need it.
