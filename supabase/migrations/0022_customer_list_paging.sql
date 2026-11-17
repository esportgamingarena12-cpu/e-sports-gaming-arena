-- Phase 28: the Customers screen loads its list a page at a time as staff scroll.
-- customer_list gets p_limit and p_offset. The defaults (200 and 0) keep every existing call working as before
-- (the top-bar search and the older tests). Rows now have a fixed order (the id breaks ties) so pages never overlap.
drop function customer_list(text);

create function customer_list(p_search text default null, p_limit int default 200, p_offset int default 0)
returns table (id bigint, name text, phone text, email text, has_login boolean, last_booking timestamptz,
               bookings int, no_shows int, active_passes int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  s text := nullif(btrim(coalesce(p_search, '')), '');
  k text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.name, c.phone, c.email, c.profile_id is not null,
           (select max(b.start_at) from bookings b where b.customer_id = c.id),
           (select count(*)::int from bookings b where b.customer_id = c.id),
           (select count(*)::int from bookings b where b.customer_id = c.id and b.status = 'no_show'),
           (select count(*)::int from customer_passes cp
             where cp.customer_id = c.id and cp.status = 'active' and now() >= cp.starts_at and now() < cp.expires_at
               and (cp.kind = 'unlimited' or cp.minutes_total > cp.minutes_used))
      from customers c
     where s is null
        or position(lower(s) in lower(c.name)) > 0
        or position(lower(s) in lower(coalesce(c.email, ''))) > 0
        or (length(k) >= 3 and position(k in regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) > 0)
     order by 6 desc nulls last, c.name, c.id
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke execute on function customer_list(text, int, int) from public, anon;
grant  execute on function customer_list(text, int, int) to authenticated;
