-- 0011_booking_info_rates.sql : the public booking page shows "from Rs X per hour" for each game type.
-- Adds the lowest hourly rate of the online-bookable stations of each type to booking_info().
-- Same grants as before (public); only the rate per hour is exposed, nothing else about stations.

create or replace function booking_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_name',    (select shop_name from settings),
    'slot_minutes', bs.slot_minutes,
    'min_slots',    bs.min_slots,
    'max_slots',    bs.max_slots,
    'window_days',  bs.window_days,
    'cutoff_hours', bs.cutoff_hours,
    'types',        (select coalesce(jsonb_agg(t order by t), '[]'::jsonb)
                       from (select distinct type as t from stations where active and online_bookable) x),
    'rates',        (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'rate_per_hour', r) order by type), '[]'::jsonb)
                       from (select type, min(rate_per_hour) as r from stations where active and online_bookable group by type) y))
    from booking_settings bs
$$;
