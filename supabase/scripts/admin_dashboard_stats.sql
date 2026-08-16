-- =============================================================
-- admin_dashboard_stats.sql
-- App-wide stats for the Admin Dashboard.
--
-- Runs as SECURITY DEFINER so it can count across ALL rows (a normal client
-- query is limited by row-level security), but it's GATED so only a registered
-- admin can call it — matched by proxy email or phone, same as the app's
-- checkUserRole logic.
--
-- ZIP coverage is read from each account's metadata
-- (auth.users.raw_user_meta_data->>'zip'), because the profiles table doesn't
-- store the ZIP.
--
-- Returns: { users, acts, groups, zips }
-- Run this once in the Supabase SQL Editor.
-- =============================================================

create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  caller_phone text;
  is_admin     boolean := false;
  result       json;
begin
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'Not authenticated';
  end if;

  -- Proxy emails look like "+1XXXXXXXXXX@phone.30acts.app"; phone is the local part.
  caller_phone := split_part(caller_email, '@', 1);

  select exists (
    select 1 from public.admins a
    where a.email = caller_email
       or a.phone = caller_phone
  ) into is_admin;

  if not is_admin then
    raise exception 'Not authorized';
  end if;

  select json_build_object(
    'users',  (select count(*) from auth.users),
    'acts',   (select count(*) from public.completions),
    'groups', (select count(*) from public.sponsors),
    'zips',   (select count(distinct raw_user_meta_data->>'zip')
                 from auth.users
                 where coalesce(raw_user_meta_data->>'zip', '') <> '')
  ) into result;

  return result;
end;
$$;

-- Any logged-in user may call it; the function itself enforces the admin gate.
grant execute on function public.admin_dashboard_stats() to authenticated;
