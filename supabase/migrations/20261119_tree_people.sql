-- Gary 19 Nov 2026: tapping "People you inspired" on Tree lists everyone in
-- your tree with their act count. Returns first name + last initial and a
-- count only - never phones, emails or stories. Deleted members show as
-- "A former member". Same tree rules as get_tree_stats().
create or replace function public.get_tree_people()
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
    return json_build_object('people', '[]'::json);
  end if;
  select phone into my_phone from profiles where id = me_id;
  if my_phone is null then
    return json_build_object('people', '[]'::json);
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
  down(ph) as (
    select ph from roots
    union
    select m.ph from members m join down d on m.referred_by = d.ph
  ),
  people as (
    select
      d.ph,
      coalesce(
        nullif(trim(concat_ws(' ',
          nullif(trim(p.first_name), ''),
          case when nullif(trim(p.last_name), '') is not null
               then left(trim(p.last_name), 1) || '.' end)), ''),
        case when p.id is null then 'A former member' else 'A friend' end
      ) as name,
      (select count(*)::int from completions c where c.user_phone = d.ph) as acts
    from (select distinct ph from down where ph <> my_phone) d
    left join profiles p on p.phone = d.ph
  )
  select coalesce(json_agg(json_build_object('name', name, 'acts', acts) order by acts desc, name), '[]'::json)
  into result
  from people;

  return json_build_object('people', result);
end;
$function$;

grant execute on function public.get_tree_people() to authenticated;
