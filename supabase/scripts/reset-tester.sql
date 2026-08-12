-- =============================================================
-- reset-tester.sql
-- Reset one or more test accounts to brand-new (30 Acts of Kindness)
--
-- What it does: fully deletes a tester's account + data so they
-- re-signup from scratch (fresh ZIP entry, reminder opt-in, etc.).
--
-- Accounts are keyed by phone. The login email is always
--   <phone>@phone.30acts.app   e.g. +13124200758@phone.30acts.app
-- so you only edit the phone numbers below.
--
-- Order matters (foreign keys): child rows first, auth.users last.
--   completions / recognition_orders  -> keyed by user_phone
--   sponsors (groups they created)     -> keyed by created_by = uid
--   profiles                            -> keyed by id = uid
--   auth.users                          -> deleted last
--
-- ⚠ sponsors: this deletes groups the tester CREATED. If one of
--   those groups has OTHER real members hanging off it, scope this
--   differently before running.
-- =============================================================


-- STEP 1 — INSPECT (run first, see what's there) -------------------
select u.email, p.first_name, p.last_name, p.phone,
       (select count(*) from completions c where c.user_phone = p.phone) as acts,
       (select count(*) from sponsors  s where s.created_by  = u.id)     as groups_created
from auth.users u
left join profiles p on p.id = u.id
where u.email in (
  '+13124200758@phone.30acts.app',   -- David   <-- edit
  '+15102827252@phone.30acts.app'    -- Sina    <-- edit
);


-- STEP 2 — RESET (delete to brand-new) -----------------------------
do $$
declare
  target_phone text;
  uid uuid;
  -- Edit this list. Phone only (no @domain). Add/remove as needed.
  phones text[] := array[
    '+13124200758',   -- David
    '+15102827252'    -- Sina
  ];
begin
  foreach target_phone in array phones
  loop
    select id into uid from auth.users
    where email = target_phone || '@phone.30acts.app';

    if uid is not null then
      delete from public.completions        where user_phone = target_phone;
      delete from public.recognition_orders where user_phone = target_phone;
      delete from public.sponsors           where created_by = uid;   -- groups they created
      delete from public.profiles           where id = uid;
      delete from auth.users                where id = uid;
      raise notice 'Reset % (uid %)', target_phone, uid;
    else
      raise notice 'No user found for %', target_phone;
    end if;
  end loop;
end $$;


-- STEP 3 — VERIFY (re-run STEP 1) ----------------------------------
-- Should return ZERO rows. That confirms the accounts are gone and
-- will come back as brand-new on next signup.


-- =============================================================
-- After reset, tell the tester:
--   1. Force-close the app TWICE (swipe away, reopen, repeat).
--      First reopen downloads the OTA update; second one runs it.
--   2. Reopen and sign up fresh (ZIP entry, reminder opt-in at end).
--   3. Run the repro.
-- =============================================================
