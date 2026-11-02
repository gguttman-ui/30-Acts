-- Item 94, children's profiles Stage 1 (1 Nov 2026).
-- Run on STAGING 1 Nov 2026 (in steps, all tested). NOT yet on production.
-- This file is the final combined form, to run once on production.
--
-- A parent adds children as family profiles under their own account. A child
-- has no phone number or sign-in: their acts live in completions under a
-- hidden member key = parent phone + "-NN", e.g. +19177218269-01.

create table public.family_members (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid not null references auth.users(id) on delete cascade,
  first_name       text not null check (length(trim(first_name)) between 1 and 30),
  age_range        text not null check (age_range in ('6-9', '10-12', '13-17')),
  member_key       text not null unique,
  consent_at       timestamptz not null default now(),
  consent_version  text not null,
  last_restart_at  timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.family_members enable row level security;

-- Adding a child needs a text-code check in the last 10 minutes
-- (verify_phone_otp records it in otp_verifications). The Apple reviewer and
-- test accounts never receive real texts and are exempt.
create or replace function public.parent_recently_verified()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    current_user_phone() in ('+15550100100', '+15550100142')
    or exists (
      select 1 from public.otp_verifications
      where phone = current_user_phone()
        and verified_at > now() - interval '10 minutes'
    );
$$;

create policy "parent reads children"
on public.family_members for select to authenticated
using (parent_id = auth.uid());

create policy "parent adds child after code check"
on public.family_members for insert to authenticated
with check (
  parent_id = auth.uid()
  and member_key like current_user_phone() || '-%'
  and parent_recently_verified()
);

create policy "parent updates children"
on public.family_members for update to authenticated
using (parent_id = auth.uid())
with check (parent_id = auth.uid() and member_key like current_user_phone() || '-%');

create policy "parent removes children"
on public.family_members for delete to authenticated
using (parent_id = auth.uid());

create policy admin_read_family_members
on public.family_members for select to authenticated
using (is_admin());

-- Children's acts: a parent can read and write acts under their own children's keys.
create policy "parent's children rows"
on public.completions for all to authenticated
using (user_phone in (select member_key from public.family_members where parent_id = auth.uid()))
with check (user_phone in (select member_key from public.family_members where parent_id = auth.uid()));

-- Removing a child (or deleting the parent's account) erases the child's acts.
create or replace function public.erase_child_acts()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.completions where user_phone = old.member_key;
  return old;
end;
$$;

create trigger family_members_erase_acts
after delete on public.family_members
for each row execute function public.erase_child_acts();

-- Children's personal acts list.
create or replace function public.is_my_child_key(k text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.family_members
    where member_key = k and parent_id = auth.uid()
  );
$$;

create policy "parent's children custom acts"
on public.user_custom_acts for all to authenticated
using (is_my_child_key(user_phone))
with check (is_my_child_key(user_phone));
