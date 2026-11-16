-- 0016_shop_updates.sql : changes from the shop owner's list (Phase 18).
--   1. opening hours: Mon-Fri 12:00-22:00, Sat-Sun 11:00-22:00
--   2. passes can show a "was" price (discount badge), e.g. a monthly subscription
--   3. the public booking_info() also lists the opening hours and the fixed-price packages (the rate card)
--   4. food photos (Storage bucket, admin only) and delete_product()
--   5. a "time is up" alarm on sessions (hourly sessions get an optional timer; packages use their own length)

-- ---------- 1. opening hours (0 = Sunday ... 6 = Saturday) ----------
update opening_hours set open_time = '12:00', close_time = '22:00', closed = false where weekday between 1 and 5;
update opening_hours set open_time = '11:00', close_time = '22:00', closed = false where weekday in (0, 6);

-- ---------- 2. discount badge on passes ----------
alter table pass_types add column original_price numeric(10,2);
alter table pass_types add constraint pass_types_original_price_check
  check (original_price is null or original_price > price);

-- ---------- 3. public info: hours + rate card ----------
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
    'passes',       (select coalesce(jsonb_agg(jsonb_build_object(
                              'name', name, 'price', price, 'original_price', original_price,
                              'validity_days', validity_days, 'station_type', station_type,
                              'kind', kind, 'minutes_total', minutes_total, 'popular', popular)
                            order by price, name), '[]'::jsonb)
                       from pass_types where active))
    from booking_settings bs
$$;

-- ---------- 4. food photos ----------
alter table products add column image_path text;
grant insert (image_path) on products to authenticated;
grant update (image_path) on products to authenticated;

-- A public bucket: anyone can see a photo by its link, only the admin can add, change or remove files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-images', 'food-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy food_images_select on storage.objects for select to authenticated
  using (bucket_id = 'food-images');
create policy food_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'food-images' and is_admin());
create policy food_images_update on storage.objects for update to authenticated
  using (bucket_id = 'food-images' and is_admin()) with check (bucket_id = 'food-images' and is_admin());
create policy food_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'food-images' and is_admin());

-- Delete a product. One that was never sold (not on a bill or an open tab, and no wastage, adjustment, sale or
-- void in its stock log) is removed for good; any other is only switched off so old bills and reports stay right.
-- Returns 'deleted' or 'archived'. The app removes the photo file after 'deleted'.
create function delete_product(p_product bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_used boolean;
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'Product not found'; end if;

  select exists (select 1 from bill_items where product_id = p_product)
      or exists (select 1 from tab_items where product_id = p_product)
      or exists (select 1 from stock_moves where product_id = p_product and move_type <> 'purchase')
    into v_used;

  if v_used then
    update products set active = false where id = p_product;
    return 'archived';
  end if;
  delete from stock_moves where product_id = p_product;
  delete from products where id = p_product;
  return 'deleted';
end $$;

revoke execute on function delete_product(bigint) from public, anon;
grant  execute on function delete_product(bigint) to authenticated;

-- ---------- 5. time-up alarm ----------
-- A package session rings when its package minutes are used up. An hourly session rings after alarm_minutes if
-- staff chose a timer when starting it. "Extend" pushes the alarm back (alarm_extra_minutes); it does not change
-- billing, which still follows the normal rules (package overtime, billing blocks).
alter table sessions
  add column alarm_minutes       int check (alarm_minutes > 0),
  add column alarm_extra_minutes int not null default 0 check (alarm_extra_minutes >= 0);

create function set_session_alarm(p_session bigint, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_minutes is not null and (p_minutes < 1 or p_minutes > 1440) then
    raise exception 'The timer must be between 1 and 1440 minutes';
  end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused') then raise exception 'The session is not open'; end if;
  if s.package_minutes is not null then raise exception 'A package session already has an end time'; end if;
  update sessions set alarm_minutes = p_minutes, alarm_extra_minutes = 0 where id = p_session;
end $$;

create function extend_session_alarm(p_session bigint, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 600 then
    raise exception 'Extend by 1 to 600 minutes';
  end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused') then raise exception 'The session is not open'; end if;
  if s.package_minutes is null and s.alarm_minutes is null then
    raise exception 'This session has no timer to extend';
  end if;
  update sessions set alarm_extra_minutes = alarm_extra_minutes + p_minutes where id = p_session;
end $$;

revoke execute on function set_session_alarm(bigint, int), extend_session_alarm(bigint, int) from public, anon;
grant  execute on function set_session_alarm(bigint, int), extend_session_alarm(bigint, int) to authenticated;
