-- 19_home_highlights.test.sql : migration 0017 (featured products, canteen block in the public booking_info()).
-- Everything is rolled back at the end.
begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a9', 'authenticated', 'authenticated', 'admin-hh@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a9', 'Admin', 'admin', true)
on conflict (id) do update set role = excluded.role, active = true;

-- start from an empty menu so the checks do not depend on what the shop sells
update products set active = false;

insert into products (name, category, price, stock_qty, low_stock_level, active, featured, track_stock, image_path) values
  ('T19 Featured',   'T19 Food',  100, 5, 0, true,  true,  true,  't19/featured.jpg'),
  ('T19 Sold Out',   'T19 Sold',  100, 0, 0, true,  true,  true,  null),
  ('T19 Hidden',     'T19 Gone',  100, 9, 0, true,  true,  true,  null),
  ('T19 Untracked',  'T19 Drinks', 20, 0, 0, true,  false, false, null);
update products set active = false where name = 'T19 Hidden';

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(jsonb_array_length(booking_info() -> 'canteen' -> 'items'), 2, 'only active items that are in stock (or not tracked) are listed');
select is(booking_info() -> 'canteen' -> 'items' -> 0 ->> 'name', 'T19 Featured', 'the featured item comes first');
select is(booking_info() -> 'canteen' -> 'items' -> 1 ->> 'name', 'T19 Untracked', 'then the others');
select is(booking_info() -> 'canteen' -> 'items' -> 0 ->> 'image_path', 't19/featured.jpg', 'with its photo path');
select ok(not exists (select 1 from jsonb_array_elements(booking_info() -> 'canteen' -> 'items') i where i ->> 'name' = 'T19 Sold Out'), 'a sold-out item is not shown');
select ok(not exists (select 1 from jsonb_array_elements(booking_info() -> 'canteen' -> 'items') i where i ->> 'name' = 'T19 Hidden'), 'a switched-off item is not shown');
select is((booking_info() -> 'canteen' -> 'categories'), '["T19 Drinks", "T19 Food"]'::jsonb, 'the categories are those of the items on offer');
select is((select array_agg(k order by k) from jsonb_object_keys(booking_info() -> 'canteen' -> 'items' -> 0) k),
          array['category', 'image_path', 'name', 'price'], 'an item exposes only name, price, category and photo');
select ok(not (booking_info() -> 'canteen' -> 'items' -> 0 ? 'stock_qty'), 'never the stock count');
select throws_ok($$select * from products$$, '42501', null, 'visitors still cannot read the products table');
reset role;

-- at most six items, featured first
insert into products (name, category, price, stock_qty, low_stock_level, active, featured) values
  ('T19 Extra 1', 'T19 More', 10, 5, 0, true, false), ('T19 Extra 2', 'T19 More', 10, 5, 0, true, false),
  ('T19 Extra 3', 'T19 More', 10, 5, 0, true, false), ('T19 Extra 4', 'T19 More', 10, 5, 0, true, false),
  ('T19 Extra 5', 'T19 More', 10, 5, 0, true, false), ('T19 Extra 6', 'T19 More', 10, 5, 0, true, false);
set local role anon;
select is(jsonb_array_length(booking_info() -> 'canteen' -> 'items'), 6, 'no more than six items are shown');
select is(booking_info() -> 'canteen' -> 'items' -> 0 ->> 'name', 'T19 Featured', 'and the featured one still leads');
reset role;

-- the admin chooses what is featured
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$update products set featured = true where name = 'T19 Extra 6'$$, 'the admin can feature an item');
select lives_ok($$update products set featured = false where name = 'T19 Featured'$$, 'and un-feature one');
reset role;
set local role anon;
select is(booking_info() -> 'canteen' -> 'items' -> 0 ->> 'name', 'T19 Extra 6', 'the home page follows the change');
reset role;

-- nothing to sell: an empty block, not an error
update products set active = false;
set local role anon;
select is(booking_info() -> 'canteen' -> 'items', '[]'::jsonb, 'with nothing to sell the item list is empty');
select is(booking_info() -> 'canteen' -> 'categories', '[]'::jsonb, 'and so are the categories');
reset role;

do $tap$
declare r text;
begin
  select string_agg(x, E'\n') into r from finish() x;
  raise exception 'TAP RESULTS: [%]', coalesce(r, 'nothing');
end $tap$;
