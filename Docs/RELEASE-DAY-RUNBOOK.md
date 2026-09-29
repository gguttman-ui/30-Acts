# 30 Acts of Kindness - release runbook

**Release: Thursday 1 October 2026, 7:00 AM Central (8:00 AM Eastern).**

The working copy with checkboxes is `RELEASE-DAY-RUNBOOK.xlsx` (Desktop). This file mirrors it for the repo. Claude gives each command at the time, one at a time.

---

## TUESDAY 29 / WEDNESDAY 30 SEPTEMBER - preparation (only you, David and the testers can see any of this)

- [x] **1. Tue - PowerShell**
  - Do: Check both logins.
  - Worked if: Both show you logged in; the list includes mtfyekdxtkdiaqbgaoza.

  ```
  npx eas whoami; npx supabase projects list
  ```

- [x] **2. Tue - PowerShell**
  - Do: Check the code is clean.
  - Worked if: "working tree clean".

  ```
  git status; git log -1 --oneline
  ```

- [x] **3. Tue - Claude + Chrome**
  - Do: Website (item 29): App Store button, Android waitlist. Checked in Chrome and committed (9ec89f2). NOT uploaded until Thursday.
  - Worked if: Page looked right; committed.

- [ ] **4. Wed - Phone / text**
  - Do: Optional (item 65): find one person with an iPhone that never had the app and a number with no account, for the influencer-link test.
  - Worked if: Someone agreed - or skip; the link uses the same code as the app's invite links.

---

## WEDNESDAY - reminders deploy (items 27, 28, 51, 52, 61, 66). Approved 29 Sep. Safe at every step: after the deploy the old key still works, so no reminder is missed.

- [ ] **5. Wed - PowerShell, in 30-Acts-current**
  - Do: Deploy the new reminders code (command in the last column).
  - Worked if: "Deployed Function send-reminders".

  ```
  npx supabase functions deploy send-reminders --project-ref mtfyekdxtkdiaqbgaoza
  ```

- [ ] **6. Wed - Supabase production - SQL Editor**
  - Do: Wait for the next 5-minute tick (:00, :05, :10 ...), then run the check query.
  - Worked if: The newest row (latest created time) shows status_code 200.

  ```
  select id, status_code, created
  from net._http_response
  order by id desc
  limit 5;
  ```

- [ ] **7. Wed - Supabase production - SQL Editor**
  - Do: Create the door secret inside Vault. The database generates it, so it never appears in chat.
  - Worked if: The query returns an id (a long string of letters and numbers).

  ```
  select vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'hex'),
    'reminders_door_secret',
    'send-reminders door check (item 52)'
  );
  ```

- [ ] **8. Wed - Supabase production - SQL Editor, then Edge Functions > Secrets**
  - Do: Read the secret from Vault, copy it (never paste it into chat) and add it as REMINDERS_DOOR_SECRET.
  - Worked if: The secret is listed.

  ```
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'reminders_door_secret';
  
  -- Copy the value (never into chat). Then Edge Functions > Secrets > Add new secret:
  -- Name: REMINDERS_DOOR_SECRET   Value: the copied text
  ```

- [ ] **9. Wed - Supabase production - SQL Editor**
  - Do: Point cron job 7 at the new door secret (it also stops sending the admin key).
  - Worked if: The query returns one row (no error).

  ```
  select cron.alter_job(
    7,
    command := $cmd$
    select net.http_post(
      url     := 'https://mtfyekdxtkdiaqbgaoza.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey',       (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_door_secret')
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cmd$
  );
  ```

- [ ] **10. Wed - Supabase production - SQL Editor**
  - Do: Wait for the next tick and run the check query again.
  - Worked if: The newest row shows status_code 200. If 401: run the rollback on the second tab.

  ```
  select id, status_code, created
  from net._http_response
  order by id desc
  limit 5;
  ```

---

## WEDNESDAY - 1.0.1 update, then the sign-in hook (items 41, 43, 15, 18, 53, 54, 67, 17c-app, 59). Approved 29 Sep. The update MUST go first: the old sign-in screen does not ask for a code.

- [ ] **11. Wed - PowerShell, in 30-Acts-current**
  - Do: Publish the 1.0.1 update (command in the last column).
  - Worked if: "Published!" with an update id. Send Claude the id.

  ```
  npx eas update --branch production --environment production -m "1.0.1"
  ```

- [ ] **12. Wed - iPhone - production 30 Acts app**
  - Do: Open it, wait 10 seconds, swipe it closed, open it again.
  - Worked if: The build stamp at the bottom of Settings shows the new update.

- [ ] **13. Wed - iPhone**
  - Do: Settings > Privacy Policy.
  - Worked if: It says "Effective: October 1, 2026".

- [ ] **14. Wed - Supabase production - Authentication > Hooks**
  - Do: Customize Access Token > Postgres > schema public > require_otp_for_password_login > Enable.
  - Worked if: The hook shows Enabled.

- [ ] **15. Wed - iPhone**
  - Do: Sign out, then sign back in.
  - Worked if: It texts you a code and you land in your own account.

- [ ] **16. Wed - Text to David and the testers**
  - Do: "Please open 30 Acts, close it and open it again to get today's update. You stay signed in."
  - Worked if: Each sees the update.

---

## THURSDAY 1 OCTOBER - release day (times are Central)

- [ ] **17. 6:45 - Laptop**
  - Do: Open tabs: App Store Connect (30 Acts of Kindness > Distribution), Supabase production, GoDaddy cPanel File Manager, Twilio, Sentry.
  - Worked if: All open and signed in.

- [ ] **18. 6:50 - Supabase production - SQL Editor**
  - Do: Check the latest reminder ticks.
  - Worked if: All rows show status_code 200.

  ```
  select id, status_code, created
  from net._http_response
  order by id desc
  limit 5;
  ```

- [ ] **19. 7:00 - App Store Connect**
  - Do: Press Release This Version, then confirm.
  - Worked if: "Processing for Distribution", then "Ready for Distribution".

- [ ] **20. 7:05 - Supabase production - Authentication > Rate Limits**
  - Do: Rate limit for sign-ups and sign-ins: change 30 to 150. Change nothing else. Save.
  - Worked if: It shows 150 requests/5 min.

- [ ] **21. every 15 min - iPhone Safari**
  - Do: Open https://apps.apple.com/app/id6762151038
  - Worked if: The app page shows a Get button (minutes to a few hours).

---

## THURSDAY - once the app shows in the App Store

- [ ] **22. iPhone**
  - Do: Delete and reinstall (you only). Press and hold 30 Acts of Kindness - NOT 30 Acts (Staging), keep that one - then Remove App > Delete App. Install it again from the App Store link.
  - Worked if: Installed from the App Store.

- [ ] **23. iPhone**
  - Do: Open it, wait 10 seconds, swipe it closed, open it again. Do NOT sign in before the reopen - the first launch runs the old code, which the hook refuses.
  - Worked if: The second launch shows the new sign-in screen.

- [ ] **24. iPhone**
  - Do: Sign in with your number and the texted code.
  - Worked if: Your acts, streak and tree are all there.

- [ ] **25. Text to David and the testers**
  - Do: "30 Acts is live! Install it from https://apps.apple.com/app/id6762151038 over your TestFlight copy (if it only offers Open, delete the app first - your account is safe). Open, close, reopen, then sign in with the text code. Keep 30 Acts (Staging)."
  - Worked if: Each confirms.

- [ ] **26. GoDaddy cPanel File Manager - public_html**
  - Do: Website (items 29, 17c-web): upload index.html, site.js and privacy.html from 30-Acts-current\website, replacing the old ones.
  - Worked if: 30actsofkindness.org shows the App Store button; the privacy page says October 1, 2026. Check on your phone too.

- [ ] **27. Test person's iPhone**
  - Do: Optional (item 65): they open your test Branch link, install, sign up. Claude gives a query to confirm the credit.
  - Worked if: The influencer's number shows as the inviter.

---

## THURSDAY - after the website is live

- [ ] **28. Email / Messages**
  - Do: Waitlist messages (item 64): send all 12 from Desktop\Waitlist launch messages.txt, including David Schwartz's "Android is coming" email. He stays on the waitlist, which is now the Android waitlist.
  - Worked if: All 12 sent.

- [ ] **29. Email / Messages**
  - Do: Your contacts and David's.
  - Worked if: Sent.

- [ ] **30. Instagram, Facebook, LinkedIn, X, YouTube, TikTok**
  - Do: Launch post with the graphics on your Desktop (influencer-30acts-*.png) pointing to 30actsofkindness.org. Switch TikTok to the 30 Acts account first.
  - Worked if: Posted on all six.

- [ ] **31. Branch dashboard, then Claude**
  - Do: Influencers (item 65): for each, create a Quick Link (alias = their name, link data ref = +1 and their 10 digits, iOS fallback id6762151038). Send Claude the name and link; Claude makes their 3 graphics with their QR code and their captions.
  - Worked if: Each influencer has their link, graphics and captions.

- [ ] **32. all day - Twilio, Sentry, Supabase**
  - Do: Watch: Twilio error 30007 (carrier filtered); Sentry new or "Regressed" issues; Supabase reminder ticks 200. Tell Claude anything odd.
  - Worked if: Nothing unexplained.

- [ ] **33. end of day - Claude**
  - Do: Update the backlog and write the handoff.
  - Worked if: Done.

---

## FRIDAY 2 OCTOBER OR LATER

- [ ] **34. App Store Connect, then Supabase production - SQL Editor**
  - Do: Downloads tile (item 42): Apps > 30 Acts of Kindness > Analytics > Overview > First-Time Downloads, "Last 7 days" (about a day behind). Send Claude the number; run the one-line SQL Claude gives.
  - Worked if: The Admin Downloads tile shows the real number.

- [ ] **35. after 5 Oct - TikTok app**
  - Do: Change the TikTok name from 30actsofkind to 30 Acts of Kindness (item 69).
  - Worked if: Name updated.

---

## If something goes wrong

- **A reminder tick returns 401 after the cron change (step 9):** Supabase production SQL Editor: run the rollback SQL in the next row. Reminders resume at the next tick. Then tell Claude.

- **ROLLBACK SQL for step 9:**

  ```
  select cron.alter_job(
    7,
    command := $cmd$
    select net.http_post(
      url     := 'https://mtfyekdxtkdiaqbgaoza.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret_key'),
        'Authorization', concat('Bearer ', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret_key'))
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cmd$
  );
  ```

- **Nobody can sign in after the hook is enabled:** Supabase production > Authentication > Hooks > Disable. Sign-in works as before. Then tell Claude.

- **The 1.0.1 update misbehaves:** Tell Claude before doing anything else. A fix or a rollback goes out the same way as the publish step.

- **The App Store page takes hours to appear:** Normal. Nothing in the "once the app shows" section starts until it does.

- **Wednesday's steps did not all get done:** Do the rest on Thursday: reminders deploy before 7:55 CT; the 1.0.1 update and hook right after Release This Version; then the rate limit.
