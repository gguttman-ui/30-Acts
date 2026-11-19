-- David's fix 9 (19 Nov 2026): "make the tree real".
-- One branch per person who joined through you (invite link, referral, or a
-- group you sponsor). Each branch's number = acts by that person AND everyone
-- who joined below them. Only counts come back - no names, no phones, no
-- stories - so nobody's private data leaves the server.
-- Same tree rules as get_tree_stats() (deleted members still count).
create or replace function public.get_tree_branches()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me_id    uuid := auth.uid();
  my_phone text;
  result   json;
begin
  if me_id is null then
    return json_build_object('branches', '[]'::json);
  end if;
  select phone into my_phone from profiles where id = me_id;
  if my_phone is null then
    return json_build_object('branches', '[]'::json);
  end if;

  with recursive
  members(ph, referred_by) as (
    select phone, referred_by from profiles where phone is not null
    union all
    select token, referred_by from deleted_members
  ),
  roots(ph) as (
    select ph from members where referred_by = my_phone
    union
    select pr.phone
    from sponsor_members cp
    join sponsors ch on ch.id = cp.sponsor_id
    join profiles pr on pr.id = cp.user_id
    where ch.created_by = me_id and pr.phone is not null
    union
    select dm.token
    from deleted_members dm
    where exists (select 1 from sponsors ch where ch.created_by = me_id and ch.id = any(dm.sponsor_ids))
  ),
  down(root, ph) as (
    select ph, ph from roots where ph <> my_phone
    union
    select d.root, m.ph
    from members m join down d on m.referred_by = d.ph
    where m.ph <> my_phone
  ),
  per_root as (
    select d.root, count(c.id)::int as acts
    from (select distinct root, ph from down) d
    left join completions c on c.user_phone = d.ph
    group by d.root
  )
  select coalesce(json_agg(acts order by acts desc), '[]'::json)
  into result
  from per_root;

  return json_build_object('branches', result);
end;
$function$;

grant execute on function public.get_tree_branches() to authenticated;
