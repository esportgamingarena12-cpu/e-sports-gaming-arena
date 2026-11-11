begin;
select * from no_plan();

-- fixtures ---------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-pt@t.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cust1-pt@t.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'cust2-pt@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = 'staff', active = true;

update booking_settings set slot_minutes = 30, window_days = 7, min_slots = 1, max_slots = 8, cutoff_hours = 2, grace_minutes = 15;
update opening_hours set open_time = '10:00', close_time = '22:00', closed = false;

-- 'pt' stations: two online ones and one walk-in only; 'wk' is a type with walk-in stations only
insert into stations (name, type, rate_per_hour, sort_order, online_bookable) values
  ('P-A', 'pt', 60, 1, true), ('P-B', 'pt', 60, 2, true), ('P-W', 'pt', 60, 3, false),
  ('W-1', 'wk', 60, 4, false);

create temp table d (day1 date);
insert into d select (now() at time zone 'Asia/Kolkata')::date + 1;
create function pg_temp.at_ist(dt date, hhmm text) returns timestamptz language sql stable as
  $$ select (dt::timestamp + hhmm::time) at time zone 'Asia/Kolkata' $$;
create temp table bk (name text, id bigint);
grant all on d, bk to authenticated, anon;

-- A. the customer's own profile ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select save_my_profile('Asha One', '98765 43210')$$, 'a customer can save their profile');
reset role;
select is((select name from customers where profile_id = '00000000-0000-0000-0000-0000000000c1'), 'Asha One', 'the customer record is created and linked');
select is((select email from customers where profile_id = '00000000-0000-0000-0000-0000000000c1'), 'cust1-pt@t.dev', 'with their login email');
select is((select full_name from profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'Asha One', 'and the account name follows');
select is((select phone from profiles where id = '00000000-0000-0000-0000-0000000000c1'), '98765 43210', 'and the account phone');
set local role authenticated;
select lives_ok($$select save_my_profile('Asha Renamed', '9876543210')$$, 'saving again updates the profile');
reset role;
select is((select count(*)::int from customers where profile_id = '00000000-0000-0000-0000-0000000000c1'), 1, 'still one record');
select is((select name from customers where profile_id = '00000000-0000-0000-0000-0000000000c1'), 'Asha Renamed', 'with the new name');
set local role authenticated;
select throws_like($$select save_my_profile('X', 'abc')$$, 'Enter a valid phone number%', 'a bad phone number is refused');
select throws_ok($$select save_my_profile('   ', '9876543210')$$, 'Name is required', 'a blank name is refused');
reset role;

-- a counter customer with the same number is NOT merged into a login
insert into customers (name, phone) values ('Counter Cust', '9444444444');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select save_my_profile('Online Two', '94444 44444')$$, 'a login can use a phone number a counter customer already has');
reset role;
select is((select count(*)::int from customers where regexp_replace(phone, '\D', '', 'g') = '9444444444'), 2,
          'it gets its own record instead of taking over the counter customer');
select is((select profile_id from customers where name = 'Counter Cust'), null, 'the counter customer stays unlinked');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select save_my_profile('Staff Person', '9876543211')$$, 'Staff accounts book from the counter',
                 'staff do not get a customer profile');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select save_my_profile('Nobody', '9876543211')$$, '42501', null, 'an anonymous visitor cannot save a profile');

-- B. public booking facts ------------------------------------------------------------------------------------
select is((select booking_info() ->> 'slot_minutes'), '30', 'booking_info is public and shows the slot length');
select is((select booking_info() ->> 'cutoff_hours'), '2', 'and the cutoff');
select ok((select booking_info() -> 'types') @> '"pt"'::jsonb, 'online-bookable station types are listed');
select ok(not ((select booking_info() -> 'types') @> '"wk"'::jsonb), 'a type with only walk-in stations is not listed');
select is((select count(*)::int from get_availability('pt', (select day1 from d))), 24, 'availability still works for visitors');
select is((select free from get_availability('pt', (select day1 from d)) where slot_start = (select pg_temp.at_ist(day1, '10:00') from d)),
          2, 'and counts only online stations');
reset role;

-- C. bills: a customer sees only their own ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into bk select 'bk1', create_booking('pt', pg_temp.at_ist(day1, '14:00'), 2) from d;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
insert into bk select 'bk2', create_booking('pt', pg_temp.at_ist(day1, '16:00'), 2) from d;
reset role;

-- as the counter would: sessions of those bookings, billed (set up directly)
insert into sessions (station_id, booking_id, customer_name, rate_per_hour, block_min, min_bill_min, started_at, ended_at, status)
select (select station_id from bookings where id = (select id from bk where name = 'bk1')), (select id from bk where name = 'bk1'),
       'Asha Renamed', 60, 15, 30, now() - interval '3 hours', now() - interval '2 hours', 'billed';
insert into sessions (station_id, booking_id, customer_name, rate_per_hour, block_min, min_bill_min, started_at, ended_at, status)
select (select station_id from bookings where id = (select id from bk where name = 'bk2')), (select id from bk where name = 'bk2'),
       'Online Two', 60, 15, 30, now() - interval '3 hours', now() - interval '2 hours', 'billed';
insert into bills (session_id, customer_name, gaming_charge, canteen_total, subtotal, discount, total)
select s.id, s.customer_name, 60, 40, 100, 10, 90 from sessions s where s.booking_id = (select id from bk where name = 'bk1');
insert into bills (session_id, customer_name, gaming_charge, canteen_total, subtotal, discount, total)
select s.id, s.customer_name, 60, 0, 60, 0, 60 from sessions s where s.booking_id = (select id from bk where name = 'bk2');
insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
select b.bill_no, 'gaming', 'Gaming - P-A', 1, 60, 60 from bills b where b.customer_name = 'Asha Renamed';
insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
select b.bill_no, 'item', 'Cola', 2, 20, 40 from bills b where b.customer_name = 'Asha Renamed';
insert into payments (bill_no, mode, amount, reference)
select b.bill_no, 'upi', 90, 'UTR-SECRET' from bills b where b.customer_name = 'Asha Renamed';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from my_bills()), 1, 'a customer sees their own bill');
select is((select total from my_bills()), 90.00::numeric, 'with its total');
select is((select jsonb_array_length(items) from my_bills()), 2, 'and its lines');
select is((select payments -> 0 ->> 'mode' from my_bills()), 'upi', 'and how it was paid');
select ok(position('UTR-SECRET' in (select payments::text from my_bills())) = 0, 'but not the payment reference');
select is((select booking_id from my_bills()), (select id from bk where name = 'bk1'), 'tied to their booking');
select is((select count(*)::int from bills), 0, 'the bills table itself stays closed to customers');
select is((select count(*)::int from sessions), 0, 'and so do sessions');
select is((select count(*)::int from bookings), 1, 'a customer sees only their own bookings');
select is((select count(*)::int from customers), 1, 'and only their own customer record');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select is((select total from my_bills()), 60.00::numeric, 'another customer sees only theirs');
select is((select count(*)::int from my_bills()), 1, 'exactly one');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::int from my_bills()), 0, 'staff have no customer bills of their own');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from my_bills()$$, '42501', null, 'an anonymous visitor cannot read bills');
reset role;

-- D. rescheduling availability: own booking only, and it ignores itself ----------------------------------------------
delete from payments; delete from bill_items; delete from bills;   -- clear the setup above for the next steps
delete from sessions where booking_id is not null;
delete from bookings;
-- the counter books P-B 12:00-13:00; the customer then books 12:00 (2 slots) and gets P-A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select create_booking('pt', pg_temp.at_ist(day1, '12:00'), 2, 'Walk Counter', '9300000001', 'counter',
                      (select id from stations where name = 'P-B')) from d;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into bk select 'mine', create_booking('pt', pg_temp.at_ist(day1, '12:00'), 2) from d;
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select free from get_availability('pt', (select day1 from d), 2) where slot_start = (select pg_temp.at_ist(day1, '12:30') from d)),
          0, 'plain availability: both online stations overlap 12:30-13:30');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is((select free from get_reschedule_availability((select id from bk where name = 'mine'), (select day1 from d))
            where slot_start = (select pg_temp.at_ist(day1, '12:30') from d)),
          1, 'for their own booking the current slot does not count against it');
select lives_ok(format($$select reschedule_booking(%s, pg_temp.at_ist((select day1 from d), '12:30'))$$, (select id from bk where name = 'mine')),
                'so shifting it by 30 minutes works');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select throws_ok(format($$select * from get_reschedule_availability(%s, pg_temp.at_ist((select day1 from d), '12:30')::date)$$, (select id from bk where name = 'mine')),
                 'Booking not found', 'another customer cannot ask about someone else''s booking');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select ok((select count(*) from get_reschedule_availability((select id from bk where name = 'mine'), (select day1 from d))) > 0,
          'staff can');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select lives_ok(format($$select cancel_booking(%s)$$, (select id from bk where name = 'mine')), 'cancelling their own booking works');
select throws_ok(format($$select * from get_reschedule_availability(%s, (select day1 from d))$$, (select id from bk where name = 'mine')),
                 'Only a confirmed booking can be rescheduled', 'a cancelled booking cannot be rescheduled');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from get_reschedule_availability(1, current_date)$$, '42501', null, 'visitors cannot use it');
reset role;

select * from finish();
rollback;
