begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-v@t.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-v@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

insert into products (name, price, stock_qty) values ('T-Chips', 20, 10);
create temp table res (bill bigint);
grant all on res to authenticated;

-- staff: stock_move + sale ----------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

select is(stock_move((select id from products where name = 'T-Chips'), 24, 'purchase', 'vendor A'), 34,
          'purchase +24 raises stock to 34');
select throws_ok(
  $$select stock_move((select id from products where name = 'T-Chips'), 100, 'wastage', 'broken')$$,
  'Not enough stock', 'wastage cannot take stock below zero');
select throws_ok(
  $$select stock_move((select id from products where name = 'T-Chips'), 1, 'wastage', '')$$,
  'A note is required for wastage and adjustments', 'wastage needs a note');

insert into res select checkout_bill(format(
  '{"items":[{"product_id":%s,"qty":4}],"payments":[{"mode":"cash","amount":80}]}',
  (select id from products where name = 'T-Chips'))::jsonb);

select throws_ok(
  format($$select void_bill(%s, 'wrong bill')$$, (select bill from res)),
  'Admin only', 'staff cannot void a bill');

reset role;
select is((select stock_qty from products where name = 'T-Chips'), 30, 'stock is 34 - 4 = 30 after the sale');
select is((select count(*)::int from stock_moves
            where product_id = (select id from products where name = 'T-Chips') and user_id is not null),
          2, 'purchase and sale are logged with the user');

-- admin voids -------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$select void_bill(%s, '   ')$$, (select bill from res)),
  'A reason is required', 'void needs a reason');
select lives_ok(format($$select void_bill(%s, 'wrong bill')$$, (select bill from res)), 'admin can void');
select throws_ok(
  format($$select void_bill(%s, 'again')$$, (select bill from res)),
  'Bill is already void', 'a bill cannot be voided twice');

reset role;
select is((select stock_qty from products where name = 'T-Chips'), 34, 'void restores stock');
select is((select status from bills where bill_no = (select bill from res)), 'void',
          'bill is kept with status void');

select * from finish();
rollback;
