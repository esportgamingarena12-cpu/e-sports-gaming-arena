begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-c@t.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-c@t.dev'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'cust-c@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin',    'admin',    true),
  ('00000000-0000-0000-0000-0000000000b2', 'Staff Sam', 'staff',   true),
  ('00000000-0000-0000-0000-0000000000c3', 'Customer', 'customer', true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = true;

insert into stations (name, type, rate_per_hour) values ('T-A', 'pc', 60), ('T-B', 'pc', 60);
insert into products (name, price, stock_qty) values ('T-Cola', 30, 5), ('T-Plain', 10, 5);
update products set track_stock = false where name = 'T-Plain';

create temp table ctx (a bigint, b bigint);
grant all on ctx to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
insert into ctx select start_session((select id from stations where name = 'T-A')),
                       start_session((select id from stations where name = 'T-B'));

-- stock is shared by all open tabs --------------------------------------------------------
select lives_ok(
  $$select add_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 3)$$,
  'tab A takes 3 of 5');
select throws_ok(
  $$select add_tab_item((select b from ctx), (select id from products where name = 'T-Cola'), 3)$$,
  'Not enough stock', 'tab B cannot take 3 more (only 2 left across all tabs)');
select lives_ok(
  $$select add_tab_item((select b from ctx), (select id from products where name = 'T-Cola'), 2)$$,
  'tab B takes the last 2');
select throws_ok(
  $$select add_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 1)$$,
  'Not enough stock', 'tab A cannot take a sixth item');

-- adding to a line increases it; removing reduces / deletes ------------------------------------
reset role;
select is((select qty from tab_items where session_id = (select a from ctx)), 3, 'tab A line holds 3');
set local role authenticated;
select lives_ok($$select remove_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 1)$$,
                'remove one from tab A');
reset role;
select is((select qty from tab_items where session_id = (select a from ctx)), 2, 'tab A line is now 2');
set local role authenticated;
select lives_ok($$select add_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 1)$$,
                'tab A can take the freed one back');
select lives_ok($$select remove_tab_item((select a from ctx), (select id from products where name = 'T-Cola'))$$,
                'remove the whole line from tab A');
reset role;
select is((select count(*)::int from tab_items where session_id = (select a from ctx)), 0, 'tab A line deleted');
set local role authenticated;
select throws_ok($$select remove_tab_item((select a from ctx), (select id from products where name = 'T-Cola'))$$,
                 'Item is not on this tab', 'removing an item that is not on the tab is refused');

-- a billed session stops reserving stock --------------------------------------------------------
select lives_ok($$select add_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 3)$$,
                'tab A takes 3 again (B holds 2)');
reset role;
update sessions set status = 'billed' where id = (select b from ctx);
set local role authenticated;
select lives_ok($$select add_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 2)$$,
                'once B is billed it no longer reserves stock, so A can take 2 more');
select throws_ok($$select add_tab_item((select a from ctx), (select id from products where name = 'T-Cola'), 1)$$,
                 'Not enough stock', 'but never more than the real stock');

-- products that are not stock-tracked are always available ----------------------------------------
select lives_ok($$select add_tab_item((select a from ctx), (select id from products where name = 'T-Plain'), 50)$$,
                'an untracked product has no stock limit');

-- stock log -------------------------------------------------------------------------------------------
select is(stock_move((select id from products where name = 'T-Cola'), 24, 'purchase', 'vendor A'), 29,
          'purchase +24 raises stock from 5 to 29');
select is((select product_name from recent_stock_moves(5) limit 1), 'T-Cola', 'newest log row is the purchase');
select is((select qty from recent_stock_moves(5) limit 1), 24, 'log shows +24');
select is((select note from recent_stock_moves(5) limit 1), 'vendor A', 'log shows the note');
select is((select user_name from recent_stock_moves(5) limit 1), 'Staff Sam', 'log shows who did it');
select is((select count(*)::int from recent_stock_moves(1)), 1, 'the limit is respected');
select ok((select count(*)::int from recent_stock_moves(100000)) <= 200, 'the limit is capped at 200');

-- others cannot read the log -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select throws_ok($$select * from recent_stock_moves(5)$$, '42501', null, 'a customer cannot read the stock log');
reset role;
set local role anon;
select throws_ok($$select * from recent_stock_moves(5)$$, '42501', null, 'an anonymous visitor cannot read the stock log');
reset role;

select * from finish();
rollback;
