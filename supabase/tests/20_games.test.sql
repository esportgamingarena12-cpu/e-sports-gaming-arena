-- 20_games.test.sql : migration 0018 (games list, coming-soon ticker, poster bucket). Rolled back at the end.
begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'admin-gm@t.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'staff-gm@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a2', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b3', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

-- the starting list is there
select ok((select count(*) from games where title in ('Valorant', 'GTA V', 'EA Sports FC')) = 3, 'the starter games are loaded');
select is((select status from games where title = 'GTA VI'), 'upcoming', 'GTA VI starts as coming soon');
select is((select release_date from games where title = 'GTA VI'), null, 'with no invented release date');

-- work with a clean list from here on
update games set active = false;

-- ---------- who can do what ----------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from games$$, '42501', null, 'visitors cannot read the games table');
select throws_ok($$insert into games (title) values ('X')$$, '42501', null, 'or add a game');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select * from games$$, 'staff can read the games table');
select throws_ok($$insert into games (title) values ('T20 Staff')$$, '42501', null, 'but cannot add a game');
select lives_ok($$update games set hot = true where title = 'Fortnite'$$, 'staff can try to change a game');
select lives_ok($$delete from games where title = 'Fortnite'$$, 'and to delete one');
reset role;
select is((select hot from games where title = 'Fortnite'), false, 'but the change did not happen');
select ok(exists (select 1 from games where title = 'Fortnite'), 'and the game is still there');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into games (title, station_type, status, hot, is_new, sort_order) values
  ('T20 Hot New', 'pc', 'available', true, true, 5),
  ('T20 Hot', 'ps5', 'available', true, false, 1),
  ('T20 Plain B', null, 'available', false, false, 2),
  ('T20 Plain A', 'pc', 'available', false, false, 2)$$, 'the admin can add available games');
select lives_ok($$insert into games (title, status, release_date, note) values
  ('T20 Soon Later', 'upcoming', '2027-01-01', null),
  ('T20 Soon Sooner', 'upcoming', '2026-12-01', 'Big one'),
  ('T20 Soon NoDate', 'upcoming', null, 'Coming soon')$$, 'and coming-soon games');
select lives_ok($$insert into games (title, status, active) values ('T20 Hidden', 'available', false)$$, 'and a hidden one');
select lives_ok($$update games set note = 'Updated' where title = 'T20 Soon NoDate'$$, 'the admin can edit a game');
select lives_ok($$insert into games (title) values ('T20 To Delete')$$, 'and add one to delete');
select lives_ok($$delete from games where title = 'T20 To Delete'$$, 'and delete it');
reset role;

-- rules on the data
select throws_ok($$insert into games (title, status) values ('T20 Bad', 'maybe')$$, '23514', null, 'status must be available or upcoming');
select throws_ok($$insert into games (title) values ('   ')$$, '23514', null, 'a title cannot be blank');
select throws_ok($$insert into games (title) values ('t20 hot')$$, '23505', null, 'a title cannot repeat');

-- ---------- what visitors see ----------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select array_agg(g ->> 'title') from jsonb_array_elements(booking_info() -> 'games') g),
          array['T20 Hot New', 'T20 Hot', 'T20 Plain A', 'T20 Plain B'], 'games: hot and new first, then by order and title; hidden ones are left out');
select is((select array_agg(u ->> 'title') from jsonb_array_elements(booking_info() -> 'upcoming') u),
          array['T20 Soon Sooner', 'T20 Soon Later', 'T20 Soon NoDate'], 'coming soon: soonest first, no date last');
select is(booking_info() -> 'upcoming' -> 0 ->> 'release_date', '2026-12-01', 'with the release date');
select is(booking_info() -> 'upcoming' -> 0 ->> 'note', 'Big one', 'and the note');
select ok(not exists (select 1 from jsonb_array_elements(booking_info() -> 'games') g where g ->> 'title' like '%Soon%'), 'upcoming games are not in the playable list');
select ok(not exists (select 1 from jsonb_array_elements(booking_info() -> 'upcoming') u where u ->> 'title' like '%Plain%'), 'and playable games are not in the coming-soon list');
select is((select array_agg(k order by k) from jsonb_object_keys(booking_info() -> 'games' -> 0) k),
          array['hot', 'image_path', 'is_new', 'station_type', 'title'], 'a game exposes only what the page needs');
select is((select array_agg(k order by k) from jsonb_object_keys(booking_info() -> 'upcoming' -> 0) k),
          array['image_path', 'note', 'release_date', 'station_type', 'title'], 'and so does an upcoming one');
reset role;

-- limits: at most 24 playable and 10 coming soon
insert into games (title, status, sort_order) select 'T20 Bulk ' || n, 'available', 10 + n from generate_series(1, 30) n;
insert into games (title, status, sort_order) select 'T20 Bulk Soon ' || n, 'upcoming', 10 + n from generate_series(1, 12) n;
set local role anon;
select is(jsonb_array_length(booking_info() -> 'games'), 24, 'no more than 24 games are shown');
select is(jsonb_array_length(booking_info() -> 'upcoming'), 10, 'and no more than 10 coming soon');
reset role;

-- nothing listed: empty lists, not an error
update games set active = false;
set local role anon;
select is(booking_info() -> 'games', '[]'::jsonb, 'with no games the list is empty');
select is(booking_info() -> 'upcoming', '[]'::jsonb, 'and so is the coming-soon list');
reset role;

-- ---------- poster photos ----------
select ok((select public from storage.buckets where id = 'game-images'), 'the poster bucket exists and is public');
select is((select file_size_limit from storage.buckets where id = 'game-images'), 2097152::bigint, 'posters are limited to 2 MB');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into storage.objects (bucket_id, name) values ('game-images', 't20/admin.jpg')$$, 'the admin can add a poster');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into storage.objects (bucket_id, name) values ('game-images', 't20/staff.jpg')$$, '42501', null, 'staff cannot add a poster');
reset role;

do $tap$
declare r text;
begin
  select string_agg(x, E'\n') into r from finish() x;
  raise exception 'TAP RESULTS: [%]', coalesce(r, 'nothing');
end $tap$;
