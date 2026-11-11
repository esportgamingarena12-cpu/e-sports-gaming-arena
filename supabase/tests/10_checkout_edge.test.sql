begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-e@t.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-e@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

insert into stations (name, type, rate_per_hour) values ('T-PC', 'pc', 60);
insert into packages (name, minutes, price, station_type) values ('T-3H', 180, 150, 'pc');
insert into products (name, price, stock_qty) values ('T-Maggi', 50, 10), ('T-Coffee', 40, 10);

create temp table ctx (a bigint, b bigint);
create temp table res (bill bigint);
grant all on ctx, res to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

-- a fully discounted session: total 0, no payments needed -----------------------------------
insert into ctx (a) select start_session((select id from stations where name = 'T-PC'));
insert into res select checkout_bill(format('{"session_id":%s,"discount":30,"payments":[]}', (select a from ctx))::jsonb);
reset role;
select is((select total from bills where bill_no = (select bill from res)), 0.00::numeric, 'a fully discounted bill has total 0');
select is((select count(*)::int from payments where bill_no = (select bill from res)), 0, 'and needs no payment rows');
select is((select discount from bills where bill_no = (select bill from res)), 30.00::numeric, 'discount equal to the subtotal is allowed');
set local role authenticated;

-- the same session cannot be billed twice -------------------------------------------------------
select throws_ok(
  format($$select checkout_bill('{"session_id":%s,"discount":0,"payments":[]}')$$, (select a from ctx)),
  'Session is already billed or cancelled', 'a billed session cannot be billed again');

-- invalid payments ------------------------------------------------------------------------------------
select throws_ok(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":1}],"payments":[{"mode":"cash","amount":10.005}]}')$$,
         (select id from products where name = 'T-Maggi')),
  'Invalid payment amount', 'a payment with 3 decimals is refused');
select throws_ok(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":1}],"payments":[{"mode":"cash","amount":-5}]}')$$,
         (select id from products where name = 'T-Maggi')),
  'Invalid payment amount', 'a negative payment is refused');
select throws_ok(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":1}],"payments":[{"mode":"bitcoin","amount":50}]}')$$,
         (select id from products where name = 'T-Maggi')),
  'Invalid payment mode', 'an unknown payment mode is refused');
select throws_like(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":1}],"payments":[{"mode":"cash","amount":60}]}')$$,
         (select id from products where name = 'T-Maggi')),
  'Payments must equal the total%', 'overpayment is refused');
select throws_like(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":1}],"payments":[{"mode":"cash","amount":40}]}')$$,
         (select id from products where name = 'T-Maggi')),
  'Payments must equal the total%', 'underpayment is refused');

-- walk-in with name and references; zero-amount rows are skipped ---------------------------------------
insert into res select checkout_bill(format(
  '{"items":[{"product_id":%s,"qty":2}],"customer_name":"Raj","payments":[{"mode":"cash","amount":40},{"mode":"upi","amount":60,"reference":"UTR9"},{"mode":"card","amount":0}]}',
  (select id from products where name = 'T-Maggi'))::jsonb);
reset role;
select is((select customer_name from bills where bill_no = (select max(bill) from res)), 'Raj', 'customer name is saved');
select is((select count(*)::int from payments where bill_no = (select max(bill) from res)), 2, 'zero-amount payment rows are skipped');
select is((select reference from payments where bill_no = (select max(bill) from res) and mode = 'upi'), 'UTR9', 'the UPI reference is saved');
select is((select stock_qty from products where name = 'T-Maggi'), 8, 'stock dropped by the 2 sold');
set local role authenticated;

-- void restores stock for a bill with gaming time and items ------------------------------------------------
update ctx set b = (select start_session((select id from stations where name = 'T-PC'),
                                         (select id from packages where name = 'T-3H')));
select add_tab_item((select b from ctx), (select id from products where name = 'T-Maggi'), 2);
select add_tab_item((select b from ctx), (select id from products where name = 'T-Coffee'), 1);
insert into res select checkout_bill(format(
  '{"session_id":%s,"discount":0,"payments":[{"mode":"cash","amount":290}]}', (select b from ctx))::jsonb);
reset role;
select is((select total from bills where bill_no = (select max(bill) from res)), 290.00::numeric,
          'package 150 + 2 x 50 + 40 = 290');
select is((select stock_qty from products where name = 'T-Maggi'), 6, 'Maggi stock after the second sale (8 - 2)');
select is((select stock_qty from products where name = 'T-Coffee'), 9, 'Coffee stock after the sale');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(format($$select void_bill(%s, 'wrong order')$$, (select max(bill) from res)), 'admin voids the bill');
reset role;
select is((select stock_qty from products where name = 'T-Maggi'), 8, 'void restores Maggi');
select is((select stock_qty from products where name = 'T-Coffee'), 10, 'void restores Coffee');
select is((select status from bills where bill_no = (select max(bill) from res)), 'void', 'the bill is kept as void');
select is((select void_reason from bills where bill_no = (select max(bill) from res)), 'wrong order', 'the void reason is stored');
select is((select count(*)::int from stock_moves where bill_no = (select max(bill) from res) and move_type = 'void'),
          2, 'a void stock move is logged per product');
select is((select count(*)::int from payments where bill_no = (select max(bill) from res)), 1,
          'the payment rows stay as a record');

select * from finish();
rollback;
