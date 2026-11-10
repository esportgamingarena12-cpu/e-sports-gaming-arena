begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-co@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = 'staff', active = true;

insert into stations (name, type, rate_per_hour) values ('T-PC', 'pc', 60);
insert into packages (name, minutes, price, station_type) values ('T-3H', 180, 150, 'pc');
insert into products (name, price, stock_qty) values
  ('T-Maggi', 50, 10), ('T-Coffee', 40, 10), ('T-Rare', 10, 3);

create temp table ctx (sid bigint);
create temp table res (bill bigint);
grant all on ctx, res to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

-- session with package + tab
insert into ctx select start_session((select id from stations where name = 'T-PC'),
                                     (select id from packages where name = 'T-3H'), 'Raj', '9999999999');
select add_tab_item((select sid from ctx), (select id from products where name = 'T-Maggi'), 2);
select add_tab_item((select sid from ctx), (select id from products where name = 'T-Coffee'), 1);

select throws_ok(
  $$select start_session((select id from stations where name = 'T-PC'))$$,
  'Station already has an open session', 'second open session on a station is refused');

select throws_ok(
  $$select add_tab_item((select sid from ctx), (select id from products where name = 'T-Rare'), 5)$$,
  'Not enough stock', 'cannot add more than the stock');

reset role;
update sessions set started_at = now() - interval '201 minutes' where id = (select sid from ctx);  -- 3h21
set local role authenticated;

select throws_like(
  format($$select checkout_bill('{"session_id":%s,"discount":5,"payments":[{"mode":"cash","amount":100},{"mode":"upi","amount":200}]}')$$,
         (select sid from ctx)),
  'Payments must equal the total%', 'payments not equal to total are refused');

select throws_ok(
  format($$select checkout_bill('{"session_id":%s,"discount":9999,"payments":[]}')$$, (select sid from ctx)),
  'Discount must be between 0 and the subtotal', 'discount above subtotal is refused');

select throws_ok(
  format($$select checkout_bill('{"session_id":%s,"discount":-1,"payments":[]}')$$, (select sid from ctx)),
  'Discount must be between 0 and the subtotal', 'negative discount is refused');

reset role;
select is((select stock_qty from products where name = 'T-Maggi'), 10, 'failed checkouts leave stock unchanged');
select is((select count(*)::int from bills where created_at = now()), 0, 'failed checkouts leave no bill');
set local role authenticated;

-- worked example: 180 gaming + 2 x 50 + 40 = 320, discount 5 -> 315; split 115 cash + 200 UPI
insert into res select checkout_bill(format(
  '{"session_id":%s,"discount":5,"payments":[{"mode":"cash","amount":115},{"mode":"upi","amount":200,"reference":"UTR1"}]}',
  (select sid from ctx))::jsonb);

reset role;
select is((select total from bills where bill_no = (select bill from res)), 315.00::numeric,
          'worked example total is 315');
select is((select gaming_charge from bills where bill_no = (select bill from res)), 180.00::numeric,
          'gaming charge recomputed on the server (180)');
select is((select sum(amount) from payments where bill_no = (select bill from res)), 315.00::numeric,
          'payments saved and add up to the total');
select is((select stock_qty from products where name = 'T-Maggi'), 8, 'stock deducted on sale');
select is((select count(*)::int from stock_moves where bill_no = (select bill from res) and move_type = 'sale'),
          2, 'a sale stock move is logged per product');
select is((select status::text from sessions where id = (select sid from ctx)), 'billed',
          'session is closed as billed');

-- walk-in sale: shortage refused, within stock succeeds
set local role authenticated;
select throws_ok(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":4}],"payments":[{"mode":"cash","amount":40}]}')$$,
         (select id from products where name = 'T-Rare')),
  'Not enough stock: T-Rare', 'walk-in sale above stock is refused');
select lives_ok(
  format($$select checkout_bill('{"items":[{"product_id":%s,"qty":2}],"payments":[{"mode":"card","amount":20}]}')$$,
         (select id from products where name = 'T-Rare')),
  'walk-in sale within stock succeeds');

select * from finish();
rollback;
