-- Phase 41: usage report (admin). For a date range (India time):
--   by_station / by_type : sessions, hours played and gaming revenue per station, and per kind of station (PC, PS5, ...),
--                          so the owner can see whether PCs or PS5s are used more
--   canteen              : every canteen item with the quantity and amount sold, best seller first, including items that
--                          sold nothing in the range (the slowest ones), so the owner can see what sells and what does not
-- Hours played = time from start to end (or to now for a running session) minus uncounted time, for sessions that started in
-- the range and were not cancelled. Revenue = the gaming charge on paid (not void) bills made in the range. Canteen counts the
-- items on paid bills made in the range.
create function usage_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid date range'; end if;
  if p_to - p_from > 366 then raise exception 'Choose a range of at most one year'; end if;
  t0 := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');

  return (
    with played as (
      select s.station_id, count(*)::int as sessions,
             sum(greatest(0, extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) - s.paused_seconds) / 60) as minutes
        from sessions s
       where s.started_at >= t0 and s.started_at < t1 and s.status <> 'cancelled'
       group by s.station_id
    ), earned as (
      select s.station_id, sum(b.gaming_charge) as revenue
        from bills b join sessions s on s.id = b.session_id
       where b.status = 'paid' and b.created_at >= t0 and b.created_at < t1
       group by s.station_id
    ), per_station as (
      select st.id, st.name, st.type, st.sort_order, st.active,
             coalesce(p.sessions, 0) as sessions,
             round(coalesce(p.minutes, 0))::int as minutes,
             coalesce(e.revenue, 0) as revenue
        from stations st
        left join played p on p.station_id = st.id
        left join earned e on e.station_id = st.id
       where st.active or p.sessions > 0 or e.revenue > 0
    ), items as (
      select pr.id, pr.name, pr.category,
             coalesce(sum(bi.qty), 0)::int as qty,
             coalesce(sum(bi.amount), 0) as amount
        from products pr
        left join (bill_items bi join bills b on b.bill_no = bi.bill_no and b.status = 'paid'
                                              and b.created_at >= t0 and b.created_at < t1 and bi.kind = 'item')
               on bi.product_id = pr.id
       where pr.deleted_at is null
       group by pr.id, pr.name, pr.category, pr.active
      having pr.active or coalesce(sum(bi.qty), 0) > 0
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'stations', n, 'sessions', sessions, 'minutes', minutes, 'revenue', revenue)
                                             order by minutes desc, type), '[]'::jsonb)
                    from (select type, count(*)::int as n, sum(sessions)::int as sessions, sum(minutes)::int as minutes, sum(revenue) as revenue
                            from per_station group by type) t),
      'by_station', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'type', type, 'active', active,
                                                                   'sessions', sessions, 'minutes', minutes, 'revenue', revenue)
                                                order by minutes desc, sort_order, name), '[]'::jsonb) from per_station),
      'canteen', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category', category, 'qty', qty, 'amount', amount)
                                              order by qty desc, amount desc, name), '[]'::jsonb) from items)
    )
  );
end $$;

revoke execute on function usage_report(date, date) from public, anon;
grant  execute on function usage_report(date, date) to authenticated;
