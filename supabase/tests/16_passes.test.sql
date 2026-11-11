begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a6', 'authenticated', 'authenticated', 'admin-ps@t.dev'),
  ('00000000-0000-0000-0000-0000000000b6', 'authenticated', 'authenticated', 'staff-ps@t.dev'),
  ('00000000-0000-0000-0000-0000000000c6', 'authenticated', 'authenticated', 'cust-ps@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a6', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b6', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

update settings set billing_block_min = 15, min_bill_min = 30;

insert into pass_types (name, price, validity_days, station_type, kind, minutes_total) values
  ('Weekly PC', 100, 7, 'pc', 'unlimited', null),
  ('PC 2 Hours', 80, 30, 'pc', 'hours', 120),
  ('Any 1 Hour', 50, 1, null, 'hours', 60),
  ('PS5 Day', 200, 1, 'ps5', 'unlimited', null);

create temp table sold (k text, j jsonb);
create temp table ses (k text, id bigint);
grant all on sold, ses to authenticated, anon;

-- ---------- selling ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
insert into sold select 'unl', sell_pass((select id from pass_types where name = 'Weekly PC'), 'Pass Cust', '97777 77701', null,
                                         '[{"mode":"cash","amount":100}]'::jsonb);
select ok((select (j ->> 'bill_no')::bigint from sold where k = 'unl') is not null, 'staff can sell a pass');
select throws_like($$select sell_pass((select id from pass_types where name = 'Weekly PC'), 'X', '9777777702', null, '[{"mode":"cash","amount":90}]'::jsonb)$$,
                   'Payments must equal the price%', 'payments must match the price');
select throws_ok($$select sell_pass((select id from pass_types where name = 'Weekly PC'), 'X', '9777777702', null, '[{"mode":"bitcoin","amount":100}]'::jsonb)$$,
                 'Invalid payment mode', 'only cash, UPI or card');
select throws_like($$select sell_pass((select id from pass_types where name = 'Weekly PC'), 'X', 'abc', null, '[{"mode":"cash","amount":100}]'::jsonb)$$,
                   'Enter a valid phone number%', 'a phone number is required');
select throws_ok($$select sell_pass((select id from pass_types where name = 'Weekly PC'), 'X', '9777777702', 'nobody@t.dev', '[{"mode":"cash","amount":100}]'::jsonb)$$,
                 'No customer has signed in with that email', 'an unknown login email is refused');
select throws_ok($$select sell_pass((select id from pass_types where name = 'Weekly PC'), '  ', '9777777702', null, '[{"mode":"cash","amount":100}]'::jsonb)$$,
                 'Customer name is required', 'a name is required');
reset role;

select is((select pass_total from bills where bill_no = (select (j ->> 'bill_no')::bigint from sold where k = 'unl')), 100.00::numeric, 'the sale is a bill with a pass line');
select is((select total from bills where bill_no = (select (j ->> 'bill_no')::bigint from sold where k = 'unl')), 100.00::numeric, 'worth the price');
select is((select gaming_charge + canteen_total from bills where bill_no = (select (j ->> 'bill_no')::bigint from sold where k = 'unl')), 0.00::numeric, 'with no gaming or canteen part');
select is((select kind from bill_items where bill_no = (select (j ->> 'bill_no')::bigint from sold where k = 'unl')), 'pass', 'its line is a pass');
select is((select sum(amount) from payments where bill_no = (select (j ->> 'bill_no')::bigint from sold where k = 'unl')), 100.00::numeric, 'and the payment is recorded');
select is((select count(*)::int from bills), 1, 'refused sales left no bills behind');
select ok((select expires_at from customer_passes limit 1) between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', 'valid for 7 days');
select is((select name from customers where phone = '97777 77701'), 'Pass Cust', 'the counter customer was created');

-- ---------- reports ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
select is((select (today_report() ->> 'passes')::numeric), 100::numeric, 'today''s report shows pass sales');
select is((select (today_report() ->> 'net_sales')::numeric), 100::numeric, 'which are part of net sales');
select is((select (today_report() -> 'daily' -> 0 ->> 'passes')::numeric), 100::numeric, 'and of the daily rows');
reset role;

-- ---------- lookup ----------
set local role authenticated;
select is((select count(*)::int from lookup_passes('977-777-7701')), 1, 'staff find a pass by phone number');
select is((select count(*)::int from lookup_passes('12')), 0, 'a short number finds nothing');
reset role;

-- ---------- using an unlimited pass ----------
set local role authenticated;
insert into ses select 'unl', start_pass_session((select id from stations where name = 'PC 1'), (select (j ->> 'pass_id')::bigint from sold where k = 'unl'));
select ok((select id from ses where k = 'unl') is not null, 'a pass session starts');
select throws_ok(format($$select start_pass_session(%s, %s)$$, (select id from stations where name = 'PC 2'), (select (j ->> 'pass_id')::bigint from sold where k = 'unl')),
                 'This pass is already in use on another station', 'one pass cannot run on two stations');
select throws_ok(format($$select start_pass_session(%s, %s)$$, (select id from stations where name = 'PS5 1'), (select (j ->> 'pass_id')::bigint from sold where k = 'unl')),
                 'This pass is not valid for this station type', 'a PC pass is not valid on a PS5');
reset role;
update sessions set started_at = now() - interval '2 hours' where id = (select id from ses where k = 'unl');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
select is((select status::text from sessions where id = (select id from ses where k = 'unl')), 'running', 'the session is open');
select checkout_bill(jsonb_build_object('session_id', (select id from ses where k = 'unl'), 'payments', '[]'::jsonb));
reset role;
select is((select gaming_charge from bills where session_id = (select id from ses where k = 'unl')), 0.00::numeric, 'two hours on an unlimited pass cost nothing');
select is((select status::text from sessions where id = (select id from ses where k = 'unl')), 'billed', 'and the session is billed');

-- ---------- hours bundle ----------
set local role authenticated;
insert into sold select 'hrs', sell_pass((select id from pass_types where name = 'PC 2 Hours'), 'Pass Cust', '9777777701', null, '[{"mode":"upi","amount":80}]'::jsonb);
insert into ses select 'h1', start_pass_session((select id from stations where name = 'PC 2'), (select (j ->> 'pass_id')::bigint from sold where k = 'hrs'));
reset role;
update sessions set started_at = now() - interval '100 minutes' where id = (select id from ses where k = 'h1');
set local role authenticated;
select checkout_bill(jsonb_build_object('session_id', (select id from ses where k = 'h1'), 'payments', '[]'::jsonb));
reset role;
select is((select gaming_charge from bills where session_id = (select id from ses where k = 'h1')), 0.00::numeric, '100 minutes inside a 120 minute bundle are free');
select is((select minutes_used from customer_passes where id = (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), 105, 'and 105 minutes (rounded to blocks) are used');

set local role authenticated;
insert into ses select 'h2', start_pass_session((select id from stations where name = 'PC 2'), (select (j ->> 'pass_id')::bigint from sold where k = 'hrs'));
reset role;
update sessions set started_at = now() - interval '40 minutes' where id = (select id from ses where k = 'h2');
select is((select pass_minutes_left from sessions where id = (select id from ses where k = 'h2')), 15, 'the next session starts with the 15 minutes left');
select is((select session_charge(id) from sessions where id = (select id from ses where k = 'h2')), 30.00::numeric,
          '45 played minutes, 15 covered: 30 extra minutes at 60 an hour');
set local role authenticated;
select checkout_bill(jsonb_build_object('session_id', (select id from ses where k = 'h2'), 'payments', '[{"mode":"cash","amount":30}]'::jsonb));
reset role;
select is((select total from bills where session_id = (select id from ses where k = 'h2')), 30.00::numeric, 'the bill is just the extra time');
select is((select minutes_used from customer_passes where id = (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), 120, 'the bundle is now used up');
set local role authenticated;
select throws_ok(format($$select start_pass_session(%s, %s)$$, (select id from stations where name = 'PC 2'), (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')),
                 'No hours left on this pass', 'a used-up bundle cannot start a session');
select is((select count(*)::int from lookup_passes('9777777701')), 1, 'and is no longer offered (only the unlimited pass is)');
reset role;

-- voiding that bill gives the hours back
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select void_bill((select bill_no from bills where session_id = (select id from ses where k = 'h2')), 'test');
reset role;
select is((select minutes_used from customer_passes where id = (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), 105, 'voiding the bill returns the hours it used');

-- ---------- expiry and cancelling ----------
update customer_passes set starts_at = now() - interval '8 days', expires_at = now() - interval '1 minute'
 where id = (select (j ->> 'pass_id')::bigint from sold where k = 'unl');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format($$select start_pass_session(%s, %s)$$, (select id from stations where name = 'PC 1'), (select (j ->> 'pass_id')::bigint from sold where k = 'unl')),
                 'This pass has expired', 'an expired pass cannot start a session');
select is((select count(*)::int from lookup_passes('9777777701')), 1, 'and is not offered');
select throws_ok(format($$select cancel_pass(%s, 'x')$$, (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), '42501', null, 'staff cannot cancel a pass');
reset role;

set local role authenticated;
insert into ses select 'h3', start_pass_session((select id from stations where name = 'PC 3'), (select (j ->> 'pass_id')::bigint from sold where k = 'hrs'));
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format($$select cancel_pass(%s, 'x')$$, (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')),
                 'This pass is in use. Bill the session first', 'a pass in use cannot be cancelled');
select cancel_session((select id from ses where k = 'h3'));
select throws_ok(format($$select cancel_pass(%s, '  ')$$, (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), 'A reason is required', 'a reason is required');
select lives_ok(format($$select cancel_pass(%s, 'customer left')$$, (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), 'the admin can cancel a pass');
select throws_ok(format($$select cancel_pass(%s, 'again')$$, (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')), 'Pass is already cancelled', 'only once');
select throws_ok(format($$select start_pass_session(%s, %s)$$, (select id from stations where name = 'PC 3'), (select (j ->> 'pass_id')::bigint from sold where k = 'hrs')),
                 'This pass was cancelled', 'a cancelled pass cannot start a session');
reset role;

-- ---------- voiding the sale cancels the pass ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
insert into sold select 'any', sell_pass((select id from pass_types where name = 'Any 1 Hour'), 'Pass Cust', '9777777701', null, '[{"mode":"card","amount":50}]'::jsonb);
reset role;
select is((select status from customer_passes where id = (select (j ->> 'pass_id')::bigint from sold where k = 'any')), 'active', 'a new pass starts active');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
set local role authenticated;
select void_bill((select (j ->> 'bill_no')::bigint from sold where k = 'any'), 'sold by mistake');
select is((sales_report((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date) ->> 'passes')::numeric,
          180::numeric, 'a voided pass sale is left out of the pass sales (100 + 80)');
select ok((select (dashboard_today() ->> 'active_passes')::int) >= 0, 'the dashboard counts active passes');
reset role;
select is((select status from customer_passes where id = (select (j ->> 'pass_id')::bigint from sold where k = 'any')), 'cancelled', 'voiding the sale cancels the pass');

-- ---------- a pass for a customer who signed in ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated"}', true);
set local role authenticated;
select save_my_profile('Login Cust', '9777777703');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
insert into sold select 'login', sell_pass((select id from pass_types where name = 'Any 1 Hour'), 'Login Cust', '9777777703', 'CUST-PS@T.DEV', '[{"mode":"cash","amount":50}]'::jsonb);
select is((select count(*)::int from lookup_passes('9777777703')), 1, 'staff find the signed-in customer''s pass by phone');
select is((select count(*)::int from my_passes()), 0, 'staff have no passes of their own');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from my_passes()), 1, 'the customer sees their pass');
select is((select state from my_passes()), 'active', 'as active');
select is((select minutes_left from my_passes()), 60, 'with the hours left');
select is((select count(*)::int from customer_passes), 1, 'and only their own pass in the table');
select is((select count(*)::int from pass_types), 0, 'customers cannot see the pass price list');
select throws_ok($$insert into pass_types (name, price, validity_days, kind) values ('Free', 0, 1, 'unlimited')$$, '42501', null, 'nor add to it');
select throws_ok($$insert into customer_passes (customer_id, pass_type_id, name, kind, price, expires_at) values (1, 1, 'x', 'unlimited', 0, now() + interval '1 day')$$, '42501', null, 'nor write passes directly');
select throws_ok($$select sell_pass(1, 'x', '9777777704', null, '[]'::jsonb)$$, '42501', null, 'nor sell a pass');
select throws_ok($$select start_pass_session(1, 1)$$, '42501', null, 'nor start a pass session');
select throws_ok($$select lookup_passes('9777777701')$$, '42501', null, 'nor look up other people''s passes');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into pass_types (name, price, validity_days, kind) values ('Free', 0, 1, 'unlimited')$$, '42501', null, 'staff cannot change the price list');
select ok((select count(*) from pass_types) = 4, 'but they can read it');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select my_passes()$$, '42501', null, 'a visitor cannot list passes');
select throws_ok($$select * from pass_types$$, '42501', null, 'nor read the price list');
reset role;

select * from finish();
rollback;
