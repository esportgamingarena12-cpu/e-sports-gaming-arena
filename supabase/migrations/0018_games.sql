-- 0018_games.sql : the games list and the coming-soon ticker (Phase 20).
-- The admin keeps a list of games: ones you can play now (with Hot / New flags) and ones that are coming soon
-- (with an optional release date). The public booking_info() returns them for the home page; visitors cannot read
-- the table itself. Poster photos go in the public Storage bucket "game-images" (only the admin can add or remove).

create table games (
  id           bigint generated always as identity primary key,
  title        text not null unique check (length(btrim(title)) > 0),
  station_type text,                                                      -- null = every game type
  status       text not null default 'available' check (status in ('available', 'upcoming')),
  hot          boolean not null default false,
  is_new       boolean not null default false,
  release_date date,                                                      -- shown for upcoming games
  note         text,                                                      -- e.g. "Coming soon"
  image_path   text,
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

revoke all on games from anon, authenticated;
grant select, insert, update, delete on games to authenticated;
alter table games enable row level security;
create policy games_select on games for select to authenticated using (is_staff());
create policy games_insert on games for insert to authenticated with check (is_admin());
create policy games_update on games for update to authenticated using (is_admin()) with check (is_admin());
create policy games_delete on games for delete to authenticated using (is_admin());

-- ---------- poster photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-images', 'game-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy game_images_select on storage.objects for select to authenticated
  using (bucket_id = 'game-images');
create policy game_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'game-images' and is_admin());
create policy game_images_update on storage.objects for update to authenticated
  using (bucket_id = 'game-images' and is_admin()) with check (bucket_id = 'game-images' and is_admin());
create policy game_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'game-images' and is_admin());

-- ---------- public info ----------
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
    'games',        (select coalesce(jsonb_agg(jsonb_build_object(
                              'title', title, 'station_type', station_type, 'hot', hot, 'is_new', is_new,
                              'image_path', image_path)
                            order by hot desc, is_new desc, sort_order, title), '[]'::jsonb)
                       from (select * from games where active and status = 'available'
                              order by hot desc, is_new desc, sort_order, title limit 24) g),
    'upcoming',     (select coalesce(jsonb_agg(jsonb_build_object(
                              'title', title, 'station_type', station_type, 'release_date', release_date,
                              'note', note, 'image_path', image_path)
                            order by release_date nulls last, sort_order, title), '[]'::jsonb)
                       from (select * from games where active and status = 'upcoming'
                              order by release_date nulls last, sort_order, title limit 10) u),
    'passes',       (select coalesce(jsonb_agg(jsonb_build_object(
                              'name', name, 'price', price, 'original_price', original_price,
                              'validity_days', validity_days, 'station_type', station_type,
                              'kind', kind, 'minutes_total', minutes_total, 'popular', popular)
                            order by price, name), '[]'::jsonb)
                       from pass_types where active))
    from booking_settings bs
$$;

-- ---------- a starting list (the owner edits it in Admin > Games) ----------
insert into games (title, station_type, status, hot, is_new, note, sort_order) values
  ('Valorant',                 'pc',  'available', true,  false, null, 1),
  ('Counter-Strike 2',         'pc',  'available', true,  false, null, 2),
  ('GTA V',                    null,  'available', true,  false, null, 3),
  ('Fortnite',                 'pc',  'available', false, false, null, 4),
  ('Apex Legends',             'pc',  'available', false, false, null, 5),
  ('Dota 2',                   'pc',  'available', false, false, null, 6),
  ('EA Sports FC',             'ps5', 'available', true,  false, null, 7),
  ('Tekken 8',                 'ps5', 'available', true,  false, null, 8),
  ('God of War Ragnarök',      'ps5', 'available', false, false, null, 9),
  ('Marvel''s Spider-Man 2',   'ps5', 'available', false, false, null, 10),
  ('Gran Turismo 7',           'ps5', 'available', false, false, null, 11),
  ('GTA VI',                   null,  'upcoming',  false, false, 'Coming soon', 100)
on conflict (title) do nothing;
