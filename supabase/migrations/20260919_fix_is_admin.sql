-- =============================================================
-- 20260919_fix_is_admin.sql
-- Fix is_admin(), which had never returned true for anyone.
--
-- THE BUG
-- The original function joined admins.phone to profiles.phone:
--
--   select exists (
--     select 1 from public.admins a
--     join public.profiles p on p.phone = a.phone
--     where p.id = auth.uid()
--   );
--
-- but every row in public.admins has phone = null. The app's
-- "Add Admin" path writes only the proxy email
-- (+1XXXXXXXXXX@phone.30acts.app) and leaves phone null, so the
-- join could never match and the function always returned false.
--
-- CONSEQUENCES (both projects, since first release)
--   * admin_read_completions   (SELECT, authenticated, is_admin())
--     never fired, so the Admin Review tab showed an admin only
--     their OWN acts. On staging that was 78 of 233.
--   * admin_delete_completions (DELETE, authenticated, is_admin())
--     never fired either.
--   * The is_admin() branch of the "own rows" policy was dead.
--
-- In short: nobody could moderate anybody else's content.
--
-- THE FIX
-- Derive the phone from the proxy email when admins.phone is null.
-- Deliberately NOT a backfill of admins.phone: that would repair
-- today's rows and break again on the next admin added, because the
-- insert path still writes email only. Fixing the insert path to
-- populate phone is a separate, optional tidy-up - this function
-- works either way.
--
-- Applied by hand 19 September 2026 to BOTH projects:
--   staging     rhalruwxylggkrebyesf
--   production  mtfyekdxtkdiaqbgaoza
-- Verified after: staging Admin Review went 78 -> 233,
-- production showed 17, matching select count(*) from completions.
-- =============================================================

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.admins a
    join public.profiles p
      on p.phone = coalesce(a.phone, split_part(a.email, '@', 1))
    where p.id = auth.uid()
  );
$function$;
