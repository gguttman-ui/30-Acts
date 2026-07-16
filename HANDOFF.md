# 30 Acts of Kindness - Session Handoff

**As of:** Thursday, July 16, 2026, ~6:35 PM Central
**Branch:** main (all work committed and pushed)
**Latest commit:** bc8e32c5
**App build:** TestFlight #90 (submitted) - carries everything below
**Goal:** Ready to submit to Apple by week of July 21, 2026

---

## 1. What shipped in build #90 (this session)

App code (all committed to main, pushed):
- Checkmark overlap fix on wide screens (iPhone 16 Pro). Checkmarks made a fixed 20px (not width-scaled) in DashboardView.js and ChallengeScreen.js so they render the same on every device. NOTE: still slightly cut off - see Tomorrow list.
- Dashboard "+" tile now shows "TODAY" underneath when the next slot is today.
- Fixed "Date value out of bounds" crash when adding an act from the Dashboard "+". Root cause: buildRunGrid gives future slots an empty scheduledDate; the "+" now passes the real log date (today, or yesterday for backfill).
- Admin Users tab rebuilt: each row shows Name, phone (formatted from profiles.phone), number of acts, joined date, and a delete button. Blank names show "Test". Removed the meaningless confirmed/unconfirmed badges, the avatar, and the search box. Sort buttons (Joined/Name/Phone) kept.
- Admin "Acts" tab renamed to "Review" (the 200-post review workflow with remove-and-notify / delete).
- (Earlier commit, build #89) Deleting a user now texts them a Terms-of-Service removal notice (delete -> then SMS, non-blocking).

Backend (Supabase, applied via SQL editor):
- FIXED infinite-recursion RLS bug on profiles. The "read my referrals" policy selected from profiles inside a profiles SELECT policy -> 42P17 recursion -> Admin Users list came back empty. Fix: new SECURITY DEFINER helper my_phone(), and the policy now uses public.my_phone() instead of an inline profiles subquery. Admins can now list all users.

---

## 2. Tomorrow (Friday) - planned

1. Twilio SMS: finish getting SMS delivery working (toll-free +18336996137 verification / A2P 10DLC). Two features depend on it and are already coded, delivery pending:
   - User-delete Terms-of-Service notice (Admin Users tab)
   - Daily reminder SMS (send-reminders edge function) - still needs end-to-end test
2. Checkmark trim: checkmarks are still slightly cut off at the bottom on the 16 Pro. Reduce the check size a touch more (or bound its slot) in DashboardView.js and ChallengeScreen.js (doneCheck currently fontSize 20 / lineHeight 22). Small edit; batch with any other fixes into the next build.

---

## 3. Backlog to review before Apple submission

App / testing:
- Re-test on TestFlight #90: David's checkmarks (16 Pro), Dashboard add-act save, Users tab (real admin account +19177218269), Review tab.
- Reminders feature end-to-end once Twilio is live.
- Minor: confirmedCount/unconfirmedCount are now unused in AdminScreen.js after removing the badges - harmless lint, can be cleaned up.

Website / compliance (not blocking the app, but for launch):
- PayPal Donate button (hosted_button_id) vs the current managed QR - the QR likely does not support guest checkout. Recommended before wide promotion.
- Confirm PayPal receipt/clearing in the 30 Acts business account.
- Illinois CO-1 charitable solicitation registration (AG Charitable Trust Bureau). Prereqs: Articles of Incorporation, EIN, bylaws, filed Form 1023. A CO-1 worksheet exists.

---

## 4. Apple submission checklist (things known to be in place)

- Reviewer demo bypass: phone +15550100100, code 123456 (also +15550100142). Implemented via BYPASS_PHONES in-app.
- In-app legal pages: terms, privacy, guidelines, moderation (LegalScreen.js).
- Delete My Account flow (delete_my_account SECURITY DEFINER + typed "DELETE" confirm).
- Content moderation on submit (isContentBlocked) and post-hoc review (Admin Review tab).
- Website live at 30actsofkindness.org with the four legal pages linked in the footer.

---

## 5. Key reference

- Supabase project: mtfyekdxtkdiaqbgaoza
- Publishable key: sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9
- EAS: @garywg/30-acts-of-kindness ; projectId 4d47d9a1-dc2b-43d5-9fd2-e45167d9ba8e
- ASC App ID 6762151038 ; bundle org.30actsofkindness.app ; team JMY3RHV7MA
- Gary's real admin account: +19177218269 (auth id e7e7f43a-5e75-47a7-aef1-31802f40d817)
- Admins: gguttman@gmail.com, +19177218269, +13124200758
- Seeded Dashboard test data (runs of 3 / 10 / 30 / live 12) lives on the +15550100142 test account. IMPORTANT: Users tab + Review only work on a real admin account, not the bypass test account.
- Twilio toll-free: +18336996137 (verification pending as of this handoff)

## 6. Build/edit workflow reminders

- Testing = EAS "preview" or "production" (TestFlight) profile. Metro is blocked by Norton; do not route to dev-client + Metro.
- File edits: [IO.File]::ReadAllText -> .Replace() -> WriteAllText with UTF8 (no BOM). For emoji, reconstruct from code points ([char]0xXXXX) so console paste stays ASCII-safe.
- Verify every edit with a SHA256 hash check before committing.