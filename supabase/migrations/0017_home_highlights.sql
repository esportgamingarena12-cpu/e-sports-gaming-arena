-- 0017_home_highlights.sql : the home page highlights the canteen.
-- The admin marks a few products "show on the home page" (featured). The public booking_info() then also returns a
-- small canteen block: the categories on offer and up to 6 items (featured first, then the rest by category and name)
-- with name, price, category and photo. Only active items that are in stock (or not stock-tracked) are shown, and
-- nothing about stock counts, costs or sales is exposed.

alter table products add column featured boolean not null default false;
grant insert (featured) on products to authenticated;
grant update (featured) on products to authenticated;

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
    'hours',        (select coalesce(jsonb_agg(jsonb_build_object(
                              'weekday', weekday, 'open', to_char(open_time, 'HH24:MI'),
                              'close', to_char(close_time, 'HH24:MI'), 'closed', closed)
                            order by weekday), '[]'::jsonb)
                       from opening_hours),
    'packages',     (select coalesce(jsonb_agg(jsonb_build_object(
                              'name', name, 'minutes', minutes, 'price', price, 'station_type', station_type)
                            order by station_type, minutes, price), '[]'::jsonb)
                       from packages where active),
    'canteen',      jsonb_build_object(
                      'categories', (select coalesce(jsonb_agg(c order by c), '[]'::jsonb)
                                       from (select distinct category as c from products
                                              where active and (not track_stock or stock_qty > 0)) z),
                      'items',      (select coalesce(jsonb_agg(jsonb_build_object(
                                              'name', name, 'price', price, 'category', category, 'image_path', image_path)
                                            order by featured desc, category, name), '[]'::jsonb)
                                       from (select * from products
                                              where active and (not track_stock or stock_qty > 0)
                                              order by featured desc, category, name
                                              limit 6) w)),
    'passes',       (select coalesce(jsonb_agg(jsonb_build_object(
                              'name', name, 'price', price, 'original_price', original_price,
                              'validity_days', validity_days, 'station_type', station_type,
                              'kind', kind, 'minutes_total', minutes_total, 'popular', popular)
                            order by price, name), '[]'::jsonb)
                       from pass_types where active))
    from booking_settings bs
$$;
