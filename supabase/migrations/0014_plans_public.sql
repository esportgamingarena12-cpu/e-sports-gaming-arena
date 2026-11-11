-- 0014_plans_public.sql : the public landing page shows the passes that are for sale ("Choose your plan").
-- booking_info() now also lists the active pass types (name, price, validity, kind, hours, game type and the
-- "most popular" flag). Nothing about sold passes or customers is exposed.

alter table pass_types add column popular boolean not null default false;

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
                       from (select type, min(rate_per_hour) as r from stations where active and online_bookable group by type) y),
    'passes',       (select coalesce(jsonb_agg(jsonb_build_object(
                              'name', name, 'price', price, 'validity_days', validity_days, 'station_type', station_type,
                              'kind', kind, 'minutes_total', minutes_total, 'popular', popular)
                            order by price, name), '[]'::jsonb)
                       from pass_types where active))
    from booking_settings bs
$$;
