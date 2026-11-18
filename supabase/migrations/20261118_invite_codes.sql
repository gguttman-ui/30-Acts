-- 20261118_invite_codes.sql -- UX review fix 4 (item 110): no phone numbers in
-- invite links or QR codes.
--
-- Each person gets one random 8-character invite code. Links carry ?inv=CODE.
-- The table is NOT readable by the app (RLS on, no policies): codes are only
-- created and resolved by the two functions below, so a code can never be
-- turned back into a phone number by a client.
-- Old links that still carry ref=<phone> keep working in the app (branch.js).
-- Run in the SQL Editor: STAGING first, then PRODUCTION.

create table if not exists public.invite_codes (
  code       text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  phone      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
-- (no policies on purpose)

-- The signed-in person's code; created on first use.
create or replace function public.my_invite_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p text := public.current_user_phone();
  c text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no I, O, 0, 1
begin
  if p is null then return null; end if;
  select code into c from public.invite_codes where phone = p;
  if c is not null then return c; end if;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.invite_codes (code, phone) values (c, p);
      return c;
    exception when unique_violation then
      -- Same code taken (retry) or this phone just got one in parallel (use it).
      select code into c from public.invite_codes where phone = p;
      if c is not null then return c; end if;
    end;
  end loop;
end;
$$;

-- Credit the signed-in (new) person's inviter from a code. Never returns the
-- inviter's phone. Does nothing if they already have an inviter.
create or replace function public.apply_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me      uuid := auth.uid();
  mine    text := public.current_user_phone();
  inviter text;
begin
  if me is null or p_code is null then return false; end if;
  select phone into inviter from public.invite_codes where code = upper(trim(p_code));
  if inviter is null or inviter = mine then return false; end if;
  insert into public.profiles (id, referred_by) values (me, inviter)
  on conflict (id) do update
    set referred_by = coalesce(public.profiles.referred_by, excluded.referred_by);
  return true;
end;
$$;

revoke all on function public.my_invite_code()       from public, anon;
revoke all on function public.apply_invite_code(text) from public, anon;
grant execute on function public.my_invite_code()       to authenticated;
grant execute on function public.apply_invite_code(text) to authenticated;
