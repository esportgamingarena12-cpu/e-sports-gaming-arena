-- 21_product_deleted.test.sql : migration 0020. A deleted product with sales history is marked deleted. Rolled back.
begin;
select * from no_plan();
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a9', 'authenticated', 'authenticated', 'admin-pd@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values ('00000000-0000-0000-0000-0000000000a9', 'Admin', 'admin', true)
on conflict (id) do update set role = excluded.role, active = true;
insert into products (name, category, price, stock_qty, low_stock_level, featured) values
  ('T21 Unsold', 'Food', 10, 0, 0, false), ('T21 Wasted', 'Food', 10, 5, 0, true), ('T21 Plain', 'Food', 10, 0, 0, false);
insert into stock_moves (product_id, move_type, qty, note) select id, 'wastage', -1, 't' from products where name = 'T21 Wasted';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
set local role authenticated;
select is(delete_product((select id from products where name = 'T21 Unsold')), 'deleted', 'a never-sold product is removed');
select is(delete_product((select id from products where name = 'T21 Wasted')), 'archived', 'a product with history is archived');
reset role;
select ok(not exists (select 1 from products where name = 'T21 Unsold'), 'the removed product is gone');
select ok((select deleted_at is not null and not active and not featured from products where name = 'T21 Wasted'), 'the archived one is marked deleted, inactive and off the home page');
select ok((select deleted_at is null from products where name = 'T21 Plain'), 'an untouched product is not marked deleted');
select is((select count(*)::int from products where name like 'T21%' and deleted_at is null), 1, 'a screen that filters deleted_at shows only the untouched one');

select * from finish();
rollback;
