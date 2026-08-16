-- =============================================================
-- admin_lists.sql
-- Admin-only LIST functions for the Admin Dashboard drill-downs.
-- Like admin_dashboard_stats(), these run SECURITY DEFINER (so they see all
-- rows past RLS) but are gated to registered admins.
--
-- Provides:
--   is_admin_caller()      -> boolean gate (shared)
--   admin_list_users()     -> all users (name, phone, email, zip, acts, joined)
--   admin_list_groups()    -> all groups/sponsors (name, code, creator, members)
--   admin_list_zips()      -> distinct ZIP codes covered + user count each
--
-- Run this once in the Supabase SQL Editor.
-- =============================================================

-- Shared admin gate: is the current caller a registered admin (by proxy email or phone)?
create or replace function public.is_admin_caller()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a
      on a.email = u.email
      or a.phone = split_part(u.email, '@', 1)
    where u.id = auth.uid()
  );
$$;
grant execute on function public.is_admin_caller() to authenticated;

-- All users.
create or replace function public.admin_list_users()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'Not authorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select
        u.id,
        p.first_name,
        p.last_name,
        p.phone,
        u.email,
        u.created_at,
        u.raw_user_meta_data->>'zip' as zip,
        (select count(*) from public.completions c where c.user_phone = p.phone) as acts
      from auth.users u
      left join public.profiles p on p.id = u.id
      order by u.created_at desc
    ) t
  );
end $$;
grant execute on function public.admin_list_users() to authenticated;

-- All groups (sponsors) with creator name + member count.
create or replace function public.admin_list_groups()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'Not authorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select
        s.id,
        s.name,
        s.join_code,
        s.created_at,
        (select nullif(trim(coalesce(pr.first_name,'') || ' ' || coalesce(pr.last_name,'')), '')
           from public.profiles pr where pr.id = s.created_by) as created_by_name,
        (select count(*) from public.sponsor_members m where m.sponsor_id = s.id) as members
      from public.sponsors s
      order by s.created_at desc
    ) t
  );
end $$;
grant execute on function public.admin_list_groups() to authenticated;

-- Distinct ZIP codes covered (from account metadata) + how many users each.
create or replace function public.admin_list_zips()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'Not authorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select
        raw_user_meta_data->>'zip'   as zip,
        raw_user_meta_data->>'state' as state,
        count(*)                     as users
      from auth.users
      where coalesce(raw_user_meta_data->>'zip', '') <> ''
      group by raw_user_meta_data->>'zip', raw_user_meta_data->>'state'
      order by count(*) desc, raw_user_meta_data->>'zip'
    ) t
  );
end $$;
grant execute on function public.admin_list_zips() to authenticated;
