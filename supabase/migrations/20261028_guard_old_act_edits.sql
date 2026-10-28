-- Item 34 (28 Oct 2026): people may edit the text of today's or yesterday's
-- act only. The app hides Edit on older acts; this rule makes the database
-- refuse it too, even from an old app version.
--
-- Acts are dated by the PHONE's date, which can be up to a day off UTC. The
-- server cannot know the phone's zone, so "today" here is the earliest
-- calendar date anywhere on Earth (UTC-12): an act is editable when its date
-- is that day or the day before. That never blocks a real today/yesterday
-- edit, and at most gives a far-east traveller a few extra hours.
--
-- Only signed-in users (role authenticated) are limited. Admin and server
-- jobs (service role, SQL Editor) are not. Day-number fixes are not limited:
-- only changes to notes or act_title are checked.

create or replace function public.guard_old_act_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and (new.notes is distinct from old.notes
          or new.act_title is distinct from old.act_title)
     and old.local_date::date < ((now() at time zone 'Etc/GMT+12')::date - 1)
  then
    raise exception 'Only today''s and yesterday''s acts can be edited'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_old_act_edits on public.completions;
create trigger guard_old_act_edits
  before update on public.completions
  for each row execute function public.guard_old_act_edits();
