begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-r@t.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-r@t.dev'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'cust-r@t.dev'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'inactive-r@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin',    'admin',    true),
  ('00000000-0000-0000-0000-0000000000b2', 'Staff',    'staff',    true),
  ('00000000-0000-0000-0000-0000000000c3', 'Customer', 'customer', true),
  ('00000000-0000-0000-0000-0000000000d4', 'Inactive', 'staff',    false)
on conflict (id) do update set role = excluded.role, active = excluded.active;

insert into stations (name, type, rate_per_hour) values ('T-PC', 'pc', 60);
insert into products (name, price, stock_qty) values ('T-Tea', 10, 10);
insert into bills (customer_name, subtotal, total) values ('seed bill', 10, 10);

-- customer ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from bills), 0, 'customer cannot read bills');
select is((select count(*)::int from products), 0, 'customer cannot read products');
select is((select count(*)::int from stations), 0, 'customer cannot read stations');
select throws_ok($$select start_session(1)$$, '42501', null, 'customer cannot start a session');

-- inactive staff -----------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
select is((select count(*)::int from bills), 0, 'inactive staff sees no bills');
select throws_ok($$select stock_move(1, 1, 'purchase', 'x')$$, '42501', null,
                 'inactive staff cannot call RPCs');

-- active staff -------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select ok((select count(*) from bills) >= 1, 'staff can read bills');
select throws_ok($$insert into bills (subtotal, total) values (1, 1)$$, '42501', null,
                 'staff cannot insert bills directly');
select throws_ok($$insert into payments (bill_no, mode, amount) values (1, 'cash', 1)$$, '42501', null,
                 'staff cannot insert payments directly');
select throws_ok($$update products set stock_qty = 999$$, '42501', null,
                 'staff cannot change stock directly');
select throws_ok($$select void_bill(1, 'x')$$, '42501', null, 'staff cannot void');
-- RLS blocks these silently (0 rows updated)
update products set price = 1 where name = 'T-Tea';
update settings set shop_name = 'Hacked';
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b2';
reset role;
select is((select price from products where name = 'T-Tea'), 10.00::numeric,
          'staff price update is blocked by RLS');
select isnt((select shop_name from settings), 'Hacked', 'staff cannot change settings');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000000b2'), 'staff',
          'staff cannot promote themselves');

-- admin ----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update products set price = 12 where name = 'T-Tea';
insert into stations (name, type, rate_per_hour) values ('T-New', 'pc', 50);
reset role;
select is((select price from products where name = 'T-Tea'), 12.00::numeric, 'admin can edit products');
select ok(exists (select 1 from stations where name = 'T-New'), 'admin can add a station');

select * from finish();
rollback;
