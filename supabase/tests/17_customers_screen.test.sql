begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'authenticated', 'authenticated', 'admin-cs@t.dev'),
  ('00000000-0000-0000-0000-0000000000b7', 'authenticated', 'authenticated', 'staff-cs@t.dev'),
  ('00000000-0000-0000-0000-0000000000c7', 'authenticated', 'authenticated', 'cust-cs@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a7', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b7', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

create temp table ids (k text, id bigint);
grant all on ids to authenticated, anon;

insert into customers (name, phone) values ('Alpha Counter', '91111 11101'), ('Beta Counter', '9111111102');
insert into ids select 'alpha', id from customers where name = 'Alpha Counter';
insert into ids select 'beta', id from customers where name = 'Beta Counter';

-- a login customer
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
set local role authenticated;
select save_my_profile('Login Seven', '9111111107');
reset role;
insert into ids select 'login', id from customers where name = 'Login Seven';

-- Alpha: a no-show, a cancelled and an attended booking with a paid bill, plus a pass bought at the counter
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel)
select (select id from ids where k = 'alpha'), 'pc', (select id from stations where name = 'PC 1'),
       now() - interval '5 days', now() - interval '5 days' + interval '1 hour', 2, 'no_show', 'phone';
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel)
select (select id from ids where k = 'alpha'), 'pc', (select id from stations where name = 'PC 1'),
       now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 2, 'cancelled', 'phone';
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel)
select (select id from ids where k = 'alpha'), 'pc', (select id from stations where name = 'PC 1'),
       now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 2, 'completed', 'phone';
insert into sessions (station_id, customer_name, rate_per_hour, block_min, min_bill_min, started_at, ended_at, status, booking_id)
select (select id from stations where name = 'PC 1'), 'Alpha Counter', 60, 15, 30, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'billed',
       (select id from bookings where customer_id = (select id from ids where k = 'alpha') and status = 'completed');
insert into bills (session_id, customer_name, gaming_charge, canteen_total, subtotal, discount, total, status)
select s.id, 'Alpha Counter', 60, 0, 60, 0, 60, 'paid' from sessions s where s.customer_name = 'Alpha Counter';
insert into ids select 'bookbill', bill_no from bills where customer_name = 'Alpha Counter';

insert into pass_types (name, price, validity_days, station_type, kind, minutes_total) values ('Cust Test Pass', 100, 7, 'pc', 'unlimited', null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
set local role authenticated;
select sell_pass((select id from pass_types where name = 'Cust Test Pass'), 'Alpha Counter', '9111111101', null, '[{"mode":"cash","amount":100}]'::jsonb);

-- ---------- search ----------
select ok((select count(*) from customer_list()) >= 3, 'staff see the customers');
select is((select count(*)::int from customer_list('alp')), 1, 'search by part of a name, any case');
select is((select name from customer_list('ALP')), 'Alpha Counter', 'finds the right customer');
select is((select count(*)::int from customer_list('9111111101')), 1, 'search by phone number');
select is((select count(*)::int from customer_list('(91111) 11101')), 1, 'with spaces and brackets');
select is((select name from customer_list('111102')), 'Beta Counter', 'by the end of a phone number');
select is((select count(*)::int from customer_list('91')), 0, 'two digits are too short to match a phone');
select is((select count(*)::int from customer_list('cust-cs@t.dev')), 1, 'search by login email');
select is((select count(*)::int from customer_list('nobody at all')), 0, 'no match, no rows');

-- ---------- summary figures ----------
select is((select bookings from customer_list('alpha')), 3, 'three bookings');
select is((select no_shows from customer_list('alpha')), 1, 'one no-show');
select is((select active_passes from customer_list('alpha')), 1, 'one active pass');
select is((select has_login from customer_list('alpha')), false, 'a counter customer has no login');
select is((select has_login from customer_list('login seven')), true, 'a login customer is marked');
select is((select bookings from customer_list('beta')), 0, 'a customer with no bookings shows zero');
select is((select name from customer_list() limit 1), 'Alpha Counter', 'the most recent booker comes first');

-- ---------- detail ----------
select is((select (customer_detail((select id from ids where k = 'alpha')) -> 'counts' ->> 'no_shows')::int), 1, 'detail: no-shows');
select is((select (customer_detail((select id from ids where k = 'alpha')) -> 'counts' ->> 'cancelled')::int), 1, 'detail: cancelled');
select is((select (customer_detail((select id from ids where k = 'alpha')) -> 'counts' ->> 'attended')::int), 1, 'detail: attended');
select is((select jsonb_array_length(customer_detail((select id from ids where k = 'alpha')) -> 'bookings')), 3, 'detail: bookings listed');
select is((select jsonb_array_length(customer_detail((select id from ids where k = 'alpha')) -> 'passes')), 1, 'detail: the pass is listed');
select is((select jsonb_array_length(customer_detail((select id from ids where k = 'alpha')) -> 'bills')), 2, 'detail: the booking bill and the pass bill');
select is((select (customer_detail((select id from ids where k = 'alpha')) ->> 'spent')::numeric), 160::numeric, 'spent = the two paid bills (60 + 100)');
select is((select customer_detail((select id from ids where k = 'alpha')) -> 'customer' ->> 'notes'), null, 'no note yet');
select throws_ok($$select customer_detail(-1)$$, 'Customer not found', 'an unknown customer is refused');

-- ---------- editing ----------
select lives_ok(format($$select update_customer(%s, 'Alpha Counter', '98765 43210', 'Prefers PS5, pays by UPI')$$, (select id from ids where k = 'alpha')), 'staff can fix a phone number and keep a note');
select is((select customer_detail((select id from ids where k = 'alpha')) -> 'customer' ->> 'notes'), 'Prefers PS5, pays by UPI', 'the note is saved');
select is((select customer_detail((select id from ids where k = 'alpha')) -> 'customer' ->> 'phone'), '98765 43210', 'and the phone');
select is((select count(*)::int from customer_list('9876543210')), 1, 'the new number is searchable');
select throws_ok(format($$select update_customer(%s, 'Beta Counter', '9876543210', null)$$, (select id from ids where k = 'beta')), 'Another customer already has that phone number', 'a phone number cannot belong to two counter customers');
select throws_like(format($$select update_customer(%s, 'Beta Counter', '12ab', null)$$, (select id from ids where k = 'beta')), 'Enter a valid phone number%', 'a bad phone number is refused');
select throws_ok(format($$select update_customer(%s, '   ', '9111111102', null)$$, (select id from ids where k = 'beta')), 'Name is required', 'a name is required');
select lives_ok(format($$select update_customer(%s, 'Beta Counter', null, '')$$, (select id from ids where k = 'beta')), 'a phone number can be cleared');
select is((select phone from customer_list('beta')), null, 'cleared');
select throws_ok(format($$select update_customer(%s, 'Login Renamed', '9111111107', null)$$, (select id from ids where k = 'login')), 'This customer signed in online and manages their own name and phone. You can edit the note only', 'a signed-in customer''s name is theirs to change');
select lives_ok(format($$select update_customer(%s, 'Login Seven', '9111111107', 'Regular on weekends')$$, (select id from ids where k = 'login')), 'but staff can add a note');
select is((select customer_detail((select id from ids where k = 'login')) -> 'customer' ->> 'notes'), 'Regular on weekends', 'and it is kept');
reset role;

-- ---------- a voided bill is not counted as spend ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);
set local role authenticated;
select void_bill((select id from ids where k = 'bookbill'), 'test');
select is((select (customer_detail((select id from ids where k = 'alpha')) ->> 'spent')::numeric), 100::numeric, 'a voided bill is left out of spend');
select is((select jsonb_array_length(customer_detail((select id from ids where k = 'alpha')) -> 'bills')), 2, 'but still listed');
reset role;

-- ---------- staff notes stay private ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select notes from customers$$, '42501', null, 'not even the app can read notes straight from the table');
select ok((select count(*) from customers) > 0, 'but names and phones are still readable for the counter');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select notes from customers$$, '42501', null, 'a customer cannot read the staff note on their own record');
select is((select count(*)::int from customers), 1, 'they see only their own customer record');
select is((select name from customers), 'Login Seven', 'with their name');
select throws_ok($$select * from customer_list()$$, '42501', null, 'a customer cannot list customers');
select throws_ok($$select customer_detail(1)$$, '42501', null, 'nor open one');
select throws_ok($$select update_customer(1, 'x', null, 'x')$$, '42501', null, 'nor edit one');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from customer_list()$$, '42501', null, 'a visitor cannot list customers');
select throws_ok($$select customer_detail(1)$$, '42501', null, 'nor open one');
reset role;

select * from finish();
rollback;
