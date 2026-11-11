-- 0009_reports.sql : dashboard and reports.
-- Admin sees everything; staff get only today's report (D11). Days are Asia/Kolkata days.
-- "Sales" = total of PAID bills (after discount) by the day the bill was created. Void bills are
-- left out of sales and counted separately.

-- ---------- shared report (internal) ----------
create function report_core(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r  jsonb;
begin
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'bills',     count(*) filter (where status = 'paid'),
    'net_sales', coalesce(sum(total) filter (where status = 'paid'), 0),
    'gaming',    coalesce(sum(gaming_charge) filter (where status = 'paid'), 0),
    'canteen',   coalesce(sum(canteen_total) filter (where status = 'paid'), 0),
    'discounts', coalesce(sum(discount) filter (where status = 'paid'), 0),
    'void_count', count(*) filter (where status = 'void'),
    'void_value', coalesce(sum(total) filter (where status = 'void'), 0))
    into r
    from bills where created_at >= t0 and created_at < t1;

  r := r || jsonb_build_object(
    'payments', (select jsonb_build_object(
                   'cash', coalesce(sum(p.amount) filter (where p.mode = 'cash'), 0),
                   'upi',  coalesce(sum(p.amount) filter (where p.mode = 'upi'), 0),
                   'card', coalesce(sum(p.amount) filter (where p.mode = 'card'), 0))
                   from payments p join bills b on b.bill_no = p.bill_no
                  where b.status = 'paid' and b.created_at >= t0 and b.created_at < t1),
    'top_items', (select coalesce(jsonb_agg(x order by x.amount desc, x.name), '[]'::jsonb)
                    from (select i.name, sum(i.qty)::int as qty, sum(i.amount) as amount
                            from bill_items i join bills b on b.bill_no = i.bill_no
                           where i.kind = 'item' and b.status = 'paid' and b.created_at >= t0 and b.created_at < t1
                           group by i.name order by sum(i.amount) desc, i.name limit 10) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                       'day', d.day,
                       'bills',     coalesce(a.bills, 0),
                       'sales',     coalesce(a.sales, 0),
                       'gaming',    coalesce(a.gaming, 0),
                       'canteen',   coalesce(a.canteen, 0),
                       'discounts', coalesce(a.discounts, 0),
                       'voids',     coalesce(a.voids, 0)) order by d.day), '[]'::jsonb)
                from generate_series(p_from, p_to, interval '1 day') g(d0),
                     lateral (select g.d0::date as day) d
                left join (select (created_at at time zone 'Asia/Kolkata')::date as day,
                                  count(*) filter (where status = 'paid') as bills,
                                  sum(total) filter (where status = 'paid') as sales,
                                  sum(gaming_charge) filter (where status = 'paid') as gaming,
                                  sum(canteen_total) filter (where status = 'paid') as canteen,
                                  sum(discount) filter (where status = 'paid') as discounts,
                                  count(*) filter (where status = 'void') as voids
                             from bills where created_at >= t0 and created_at < t1 group by 1) a on a.day = d.day));
  return r;
end $$;

revoke execute on function report_core(date, date) from public, anon, authenticated;

-- ---------- admin: a date range ----------
create function sales_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid date range'; end if;
  if p_to - p_from > 366 then raise exception 'Choose a range of at most one year'; end if;
  return report_core(p_from, p_to);
end $$;

-- ---------- staff and admin: today only ----------
create function today_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return report_core(v_today, v_today);
end $$;

-- ---------- admin: the dashboard ----------
create function dashboard_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  t0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sales', (report_core(v_today, v_today) - 'daily' - 'top_items'),
    'occupancy', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'total', total, 'in_use', in_use) order by type), '[]'::jsonb)
                    from (select st.type, count(*)::int as total,
                                 count(*) filter (where exists (select 1 from sessions s
                                                                 where s.station_id = st.id and s.status in ('running', 'paused')))::int as in_use
                            from stations st where st.active group by st.type) o),
    'bookings', (select jsonb_build_object(
                   'upcoming',   count(*) filter (where status = 'confirmed' and end_at > now()),
                   'checked_in', count(*) filter (where status in ('checked_in', 'completed')),
                   'no_show',    count(*) filter (where status = 'no_show'),
                   'cancelled',  count(*) filter (where status = 'cancelled'))
                   from bookings where start_at >= t0 and start_at < t0 + interval '1 day'),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'stock_qty', stock_qty, 'low_stock_level', low_stock_level)
                                            order by stock_qty, name), '[]'::jsonb)
                    from products where active and track_stock and stock_qty <= low_stock_level));
end $$;

-- ---------- admin: daily sales and occupancy ----------
-- Occupancy = played minutes (started that day, pauses removed) / (active stations x opening minutes).
-- It uses today's station list and opening hours for every day shown.
create function sales_trend(p_days int default 30)
returns table (day date, sales numeric, occupancy numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_days  int  := least(greatest(coalesce(p_days, 30), 1), 366);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_n     int;
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from stations where active;
  return query
    select d.day,
           coalesce(b.sales, 0)::numeric,
           case when cap.minutes > 0
                then round(least(100, 100 * coalesce(p.played, 0) / cap.minutes), 1)
                else 0 end::numeric
      from (select (v_today - g)::date as day from generate_series(v_days - 1, 0, -1) g) d
      left join (select (created_at at time zone 'Asia/Kolkata')::date as day, sum(total) as sales
                   from bills where status = 'paid' group by 1) b on b.day = d.day
      left join (select (started_at at time zone 'Asia/Kolkata')::date as day,
                        sum(greatest(0, extract(epoch from (coalesce(ended_at, now()) - started_at)) - paused_seconds) / 60) as played
                   from sessions where status in ('running', 'paused', 'ended', 'billed') group by 1) p on p.day = d.day
      left join lateral (select case when oh.closed then 0
                                     else v_n * (extract(epoch from (oh.close_time - oh.open_time)) / 60) end as minutes
                           from opening_hours oh where oh.weekday = extract(dow from d.day)::int) cap on true
     order by d.day;
end $$;

-- ---------- admin: busiest hours ----------
create function busy_hours(p_days int default 30)
returns table (hour int, session_count int, sales numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_days  int := least(greatest(coalesce(p_days, 30), 1), 366);
  t0 timestamptz := (((now() at time zone 'Asia/Kolkata')::date - (least(greatest(coalesce(p_days, 30), 1), 366) - 1))::timestamp at time zone 'Asia/Kolkata');
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select h, coalesce(x.n, 0)::int, coalesce(x.sales, 0)::numeric
      from generate_series(0, 23) h
      left join (select extract(hour from s.started_at at time zone 'Asia/Kolkata')::int as hr,
                        count(*) as n,
                        sum(b.total) filter (where b.status = 'paid') as sales
                   from sessions s left join bills b on b.session_id = s.id
                  where s.started_at >= t0 and s.status in ('running', 'paused', 'ended', 'billed')
                  group by 1) x on x.hr = h
     order by h;
end $$;

-- ---------- privileges ----------
revoke execute on function sales_report(date, date), today_report(), dashboard_today(), sales_trend(int), busy_hours(int)
  from public, anon;
grant execute on function sales_report(date, date), today_report(), dashboard_today(), sales_trend(int), busy_hours(int)
  to authenticated;
