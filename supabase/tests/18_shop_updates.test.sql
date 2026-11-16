-- 18_shop_updates.test.sql : migration 0016 (opening hours, discount price, public rate card, food photos,
-- delete_product, time-up alarm). Everything is rolled back at the end.
begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a8', 'authenticated', 'authenticated', 'admin-su@t.dev'),
  ('00000000-0000-0000-0000-0000000000b8', 'authenticated', 'authenticated', 'staff-su@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a8', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b8', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

insert into stations (name, type, rate_per_hour, sort_order) values
  ('T18 PC A', 'pc', 90, 901), ('T18 PC B', 'pc', 90, 902), ('T18 PC C', 'pc', 90, 903);
insert into packages (name, minutes, price, station_type, active) values
  ('T18 Pack', 60, 90, 'pc', true), ('T18 Old Pack', 30, 50, 'pc', false);
insert into products (name, category, price, stock_qty, low_stock_level) values
  ('T18 Unsold', 'Food', 10, 0, 0), ('T18 Wasted', 'Food', 10, 0, 0), ('T18 OnTab', 'Food', 10, 0, 0);

create temp table ses (k text, id bigint);
grant all on ses to authenticated, anon;

-- ---------- 1. opening hours ----------
select is((select open_time::text from opening_hours where weekday = 1), '12:00:00', 'Monday opens at 12:00');
select is((select open_time::text from opening_hours where weekday = 5), '12:00:00', 'Friday opens at 12:00');
select is((select open_time::text from opening_hours where weekday = 6), '11:00:00', 'Saturday opens at 11:00');
select is((select open_time::text from opening_hours where weekday = 0), '11:00:00', 'Sunday opens at 11:00');
select is((select count(*)::int from opening_hours where close_time = '22:00' and not closed), 7, 'every day closes at 22:00 and none is closed');

-- ---------- 2. discount price ----------
select throws_ok($$insert into pass_types (name, price, original_price, validity_days, kind) values ('T18 Bad', 100, 100, 30, 'unlimited')$$,
                 '23514', null, 'a "was" price must be higher than the price');
select lives_ok($$insert into pass_types (name, price, original_price, validity_days, kind) values ('T18 Month', 1600, 2000, 30, 'unlimited')$$,
                'a discounted monthly pass can be created');
select lives_ok($$insert into pass_types (name, price, validity_days, kind) values ('T18 Day', 150, 1, 'unlimited')$$,
                'a daily pass can be created');

-- ---------- 3. public info ----------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(jsonb_array_length(booking_info() -> 'hours'), 7, 'visitors see seven days of opening hours');
select is((booking_info() -> 'hours' -> 1 ->> 'open'), '12:00', 'Monday opens at 12:00 in the public info');
select is((booking_info() -> 'hours' -> 6 ->> 'open'), '11:00', 'Saturday opens at 11:00 in the public info');
select ok((select bool_or(p ->> 'name' = 'T18 Pack') from jsonb_array_elements(booking_info() -> 'packages') p), 'active packages are listed');
select ok(not (select bool_or(p ->> 'name' = 'T18 Old Pack') from jsonb_array_elements(booking_info() -> 'packages') p), 'switched-off packages are not');
select is((select (p ->> 'original_price')::numeric from jsonb_array_elements(booking_info() -> 'passes') p where p ->> 'name' = 'T18 Month'), 2000::numeric,
          'a pass shows its "was" price');
select is((select p ->> 'original_price' from jsonb_array_elements(booking_info() -> 'passes') p where p ->> 'name' = 'T18 Day'), null,
          'a pass without one shows none');
reset role;

-- ---------- 4. food photos and delete_product ----------
select ok((select public from storage.buckets where id = 'food-images'), 'the food photo bucket exists and is public');
select is((select file_size_limit from storage.buckets where id = 'food-images'), 2097152::bigint, 'photos are limited to 2 MB');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into storage.objects (bucket_id, name) values ('food-images', 't18/admin.jpg')$$, 'the admin can add a photo');
select lives_ok($$update products set image_path = 't18/admin.jpg' where name = 'T18 Unsold'$$, 'and attach it to a product');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into storage.objects (bucket_id, name) values ('food-images', 't18/staff.jpg')$$, '42501', null, 'staff cannot add a photo');
select throws_ok($$select delete_product((select id from products where name = 'T18 Unsold'))$$, '42501', null, 'staff cannot delete a product');
reset role;

set local role anon;
select throws_ok($$select delete_product(1)$$, '42501', null, 'a visitor cannot delete a product');
reset role;

-- a product that has been wasted, and one that is on an open tab, can only be archived
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', true);
set local role authenticated;
select stock_move((select id from products where name = 'T18 Wasted'), 5, 'purchase', null);
select stock_move((select id from products where name = 'T18 Wasted'), 1, 'wastage', 'dropped');
insert into ses select 'tab', start_session((select id from stations where name = 'T18 PC A'));
reset role;
insert into tab_items (session_id, product_id, qty) values
  ((select id from ses where k = 'tab'), (select id from products where name = 'T18 OnTab'), 1);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);
set local role authenticated;
select is(delete_product((select id from products where name = 'T18 Unsold')), 'deleted', 'a never-sold product is deleted');
select is(delete_product((select id from products where name = 'T18 Wasted')), 'archived', 'one with wastage history is archived');
select is(delete_product((select id from products where name = 'T18 OnTab')), 'archived', 'one on an open tab is archived');
select throws_like($$select delete_product(-1)$$, 'Product not found%', 'an unknown product is refused');
reset role;
select ok(not exists (select 1 from products where name = 'T18 Unsold'), 'the deleted product is gone');
select is((select active from products where name = 'T18 Wasted'), false, 'the archived product is switched off, not removed');
select is((select count(*)::int from stock_moves where product_id = (select id from products where name = 'T18 Wasted')), 2, 'and keeps its stock log');

-- ---------- 5. time-up alarm ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', true);
set local role authenticated;
insert into ses select 'hour', start_session((select id from stations where name = 'T18 PC B'));
insert into ses select 'pack', start_session((select id from stations where name = 'T18 PC C'), (select id from packages where name = 'T18 Pack'));

select throws_like(format($$select extend_session_alarm(%s, 15)$$, (select id from ses where k = 'hour')),
                   'This session has no timer to extend%', 'an hourly session with no timer cannot be extended');
select lives_ok(format($$select set_session_alarm(%s, 60)$$, (select id from ses where k = 'hour')), 'staff can set a timer on an hourly session');
select is((select alarm_minutes from sessions where id = (select id from ses where k = 'hour')), 60, 'the timer is saved');
select throws_like(format($$select set_session_alarm(%s, 0)$$, (select id from ses where k = 'hour')),
                   'The timer must be between%', 'a zero timer is refused');
select throws_like(format($$select set_session_alarm(%s, 5000)$$, (select id from ses where k = 'hour')),
                   'The timer must be between%', 'so is a timer over a day');
select throws_like(format($$select set_session_alarm(%s, 30)$$, (select id from ses where k = 'pack')),
                   'A package session already has an end time%', 'a package session keeps its own end time');
select lives_ok(format($$select extend_session_alarm(%s, 15)$$, (select id from ses where k = 'hour')), 'a timer can be extended');
select lives_ok(format($$select extend_session_alarm(%s, 30)$$, (select id from ses where k = 'pack')), 'so can a package alarm');
select is((select alarm_extra_minutes from sessions where id = (select id from ses where k = 'hour')), 15, 'the extension is saved');
select throws_like(format($$select extend_session_alarm(%s, 0)$$, (select id from ses where k = 'hour')),
                   'Extend by 1 to 600 minutes%', 'extending by nothing is refused');
select lives_ok(format($$select set_session_alarm(%s, null)$$, (select id from ses where k = 'hour')), 'a timer can be cleared');
select is((select alarm_extra_minutes from sessions where id = (select id from ses where k = 'hour')), 0, 'which also clears the extension');
select throws_like($$select set_session_alarm(-1, 30)$$, 'Session not found%', 'an unknown session is refused');
reset role;

update sessions set status = 'ended', ended_at = now() where id = (select id from ses where k = 'hour');
set local role authenticated;
select throws_like(format($$select set_session_alarm(%s, 30)$$, (select id from ses where k = 'hour')),
                   'The session is not open%', 'an ended session cannot be given a timer');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select set_session_alarm(1, 30)$$, '42501', null, 'a visitor cannot set a timer');
select throws_ok($$select extend_session_alarm(1, 30)$$, '42501', null, 'nor extend one');
reset role;

select * from finish();
rollback;
