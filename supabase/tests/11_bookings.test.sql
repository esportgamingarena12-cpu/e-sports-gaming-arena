begin;
select * from no_plan();

-- fixtures ---------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-bk@t.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cust1-bk@t.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'cust2-bk@t.dev'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'cust3-bk@t.dev'),
  ('00000000-0000-0000-0000-0000000000c9', 'authenticated', 'authenticated', 'noprofile-bk@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = 'staff', active = true;
insert into customers (profile_id, name, phone) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cust One', '9000000001'),
  ('00000000-0000-0000-0000-0000000000c2', 'Cust Two', '9000000002'),
  ('00000000-0000-0000-0000-0000000000c3', 'Cust Three', '9000000003');

-- known rules, whatever the shop has configured
update booking_settings set slot_minutes = 30, window_days = 7, min_slots = 1, max_slots = 8, cutoff_hours = 2, grace_minutes = 15;
update opening_hours set open_time = '10:00', close_time = '22:00', closed = false;

-- test stations: type 'tt' keeps them apart from the real ones. T-W is walk-in only.
insert into stations (name, type, rate_per_hour, sort_order, online_bookable) values
  ('T-A', 'tt', 60, 1, true), ('T-B', 'tt', 60, 2, true), ('T-W', 'tt', 60, 3, false);

create temp table d (day1 date, day2 date, day9 date, today date);
insert into d select (now() at time zone 'Asia/Kolkata')::date + 1, (now() at time zone 'Asia/Kolkata')::date + 2,
                     (now() at time zone 'Asia/Kolkata')::date + 9, (now() at time zone 'Asia/Kolkata')::date;
create function pg_temp.at_ist(dt date, hhmm text) returns timestamptz language sql stable as
  $$ select (dt::timestamp + hhmm::time) at time zone 'Asia/Kolkata' $$;
create temp table bk (name text, id bigint);
grant all on d, bk to authenticated, anon;
insert into bk select 'stA', id from stations where name = 'T-A';   -- customers cannot read stations, so keep the id here

-- A. the database rule itself (as superuser) ------------------------------------------------------------
insert into customers (name, phone) values ('Direct', '9111111111');
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Direct'), 'tt', (select id from stations where name = 'T-A'),
       pg_temp.at_ist(day1, '11:00'), pg_temp.at_ist(day1, '12:00'), 2, 'counter' from d;

select throws_ok($$
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
  select (select id from customers where name = 'Direct'), 'tt', (select id from stations where name = 'T-A'),
         pg_temp.at_ist(day1, '11:30'), pg_temp.at_ist(day1, '12:30'), 2, 'counter' from d$$,
  '23P01', null, 'two overlapping bookings on one station are refused by the database');
select lives_ok($$
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
  select (select id from customers where name = 'Direct'), 'tt', (select id from stations where name = 'T-B'),
         pg_temp.at_ist(day1, '11:30'), pg_temp.at_ist(day1, '12:30'), 2, 'counter' from d$$,
  'the same time on another station is fine');
select lives_ok($$
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
  select (select id from customers where name = 'Direct'), 'tt', (select id from stations where name = 'T-A'),
         pg_temp.at_ist(day1, '12:00'), pg_temp.at_ist(day1, '12:30'), 1, 'counter' from d$$,
  'back-to-back bookings (end = next start) are fine');

update bookings set status = 'cancelled'
 where station_id = (select id from stations where name = 'T-A') and start_at = (select pg_temp.at_ist(day1, '11:00') from d);
select lives_ok($$
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
  select (select id from customers where name = 'Direct'), 'tt', (select id from stations where name = 'T-A'),
         pg_temp.at_ist(day1, '11:00'), pg_temp.at_ist(day1, '11:30'), 1, 'counter' from d$$,
  'a cancelled booking no longer blocks its station');
update bookings set status = 'no_show' where station_id = (select id from stations where name = 'T-B');
select lives_ok($$
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
  select (select id from customers where name = 'Direct'), 'tt', (select id from stations where name = 'T-B'),
         pg_temp.at_ist(day1, '11:30'), pg_temp.at_ist(day1, '12:30'), 2, 'counter' from d$$,
  'a no-show booking no longer blocks its station');
delete from bookings;   -- clean slate for the function tests

-- B. create_booking as staff ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

insert into bk select 'raj12', create_booking('tt', pg_temp.at_ist(day1, '12:00'), 2, 'Raj', '98765 43210', 'counter') from d;
reset role;
select is((select slots from bookings where id = (select id from bk where name = 'raj12')), 2, 'staff booking saved with its slots');
select is((select end_at from bookings where id = (select id from bk where name = 'raj12')), (select pg_temp.at_ist(day1, '13:00') from d),
          'end time = start + slots x 30 min');
select is((select s.name from bookings b join stations s on s.id = b.station_id where b.id = (select id from bk where name = 'raj12')),
          'T-A', 'the first free station is assigned');
select is((select channel::text from bookings where id = (select id from bk where name = 'raj12')), 'counter', 'channel is recorded');
select is((select status::text from bookings where id = (select id from bk where name = 'raj12')), 'confirmed', 'a new booking is confirmed');
set local role authenticated;

select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '15:00'), 1, 'Raj Again', '9876543210', 'phone')$$,
                'the same phone number can book again');
reset role;
select is((select count(*)::int from customers where regexp_replace(phone, '\D', '', 'g') = '9876543210'), 1,
          'the same phone number reuses the customer record');
set local role authenticated;

select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '09:30'), 1, 'X', '9000000009')$$,
                   'Outside opening hours%', 'before opening time is refused');
select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '21:30'), 2, 'X', '9000000009')$$,
                   'Outside opening hours%', 'ending after closing time is refused');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day9 from d), '12:00'), 1, 'X', '9000000009')$$,
                 'Bookings open up to 7 days ahead', 'beyond the 7 day window is refused');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '12:10'), 1, 'X', '9000000009')$$,
                 'Start time must be on a 30 minute boundary', 'a start off the 30 minute boundary is refused');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '12:00'), 0, 'X', '9000000009')$$,
                 'Booking length must be between 1 and 8 slots', 'zero slots is refused');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '12:00'), 9, 'X', '9000000009')$$,
                 'Booking length must be between 1 and 8 slots', 'more than 8 slots is refused');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select today from d) - 1, '12:00'), 1, 'X', '9000000009')$$,
                 'That time has already passed', 'a time in the past is refused');
select throws_ok($$select create_booking('nope', pg_temp.at_ist((select day1 from d), '12:00'), 1, 'X', '9000000009')$$,
                 'Unknown station type', 'an unknown station type is refused');
select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '16:00'), 1, 'X', '123')$$,
                   'Enter a valid phone number%', 'a bad phone number is refused');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '16:00'), 1, '', '9000000009')$$,
                 'Customer name is required', 'a missing name is refused');

reset role;
update opening_hours set closed = true where weekday = extract(dow from (select day2 from d))::int;
set local role authenticated;
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day2 from d), '12:00'), 1, 'X', '9000000009')$$,
                 'We are closed on that day', 'a closed day is refused');
reset role;
update opening_hours set closed = false;
set local role authenticated;

-- auto-assign across stations: staff may also use the walk-in-only station
select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '18:00'), 1, 'A1', '9200000001')$$, 'booking 1 at 18:00');
select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '18:00'), 1, 'A2', '9200000002')$$, 'booking 2 at 18:00');
select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '18:00'), 1, 'A3', '9200000003')$$,
                'booking 3 at 18:00 (the walk-in-only station, allowed for staff)');
select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '18:00'), 1, 'A4', '9200000004')$$,
                   'Slot just taken%', 'a fourth booking at the same time is refused');
reset role;
select is((select string_agg(s.name, ',' order by s.name) from bookings b join stations s on s.id = b.station_id
            where b.start_at = (select pg_temp.at_ist(day1, '18:00') from d)), 'T-A,T-B,T-W', 'bookings spread over all three stations');
set local role authenticated;

select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '19:00'), 1, 'S1', '9300000001', 'counter',
                  (select id from stations where name = 'T-B'))$$, 'staff can pick a specific station');
reset role;
select is((select s.name from bookings b join stations s on s.id = b.station_id where b.start_at = (select pg_temp.at_ist(day1, '19:00') from d)),
          'T-B', 'and gets it');
set local role authenticated;
select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '19:00'), 1, 'S2', '9300000002', 'counter',
                  (select id from stations where name = 'T-B'))$$, 'Slot just taken%', 'that station is then taken');

-- C. customers (online): auto-assigned, online-bookable stations only ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '20:00'), 1)$$, 'customer 1 books 20:00');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '20:00'), 1)$$, 'customer 2 books 20:00');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '20:00'), 1)$$,
                   'Slot just taken%', 'customer 3 cannot get the walk-in-only station');
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '21:00'), 1, null, null, 'online',
                  (select id from bk where name = 'stA'))$$,
                 'Customers cannot pick a specific station', 'customers cannot pick a station');
reset role;
select is((select string_agg(distinct channel::text, ',') from bookings where start_at = (select pg_temp.at_ist(day1, '20:00') from d)),
          'online', 'customer bookings are online');
select is((select count(*)::int from bookings b join stations s on s.id = b.station_id
            where b.start_at = (select pg_temp.at_ist(day1, '20:00') from d) and s.name = 'T-W'), 0,
          'no customer booking on the walk-in-only station');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '21:00'), 1)$$,
                 '42501', null, 'an anonymous visitor cannot book');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c9","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '21:00'), 1)$$,
                   'Please complete your profile%', 'a customer must complete name and phone first');
reset role;

-- D. availability ------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from get_availability('tt', (select day2 from d))), 24, '24 half-hour slots between 10:00 and 22:00');
select is((select free from get_availability('tt', (select day1 from d)) where slot_start = (select pg_temp.at_ist(day1, '10:00') from d)),
          2, 'an untouched slot has 2 free online stations');
select is((select free from get_availability('tt', (select day1 from d)) where slot_start = (select pg_temp.at_ist(day1, '12:00') from d)),
          1, 'a slot with one booking has 1 left');
select is((select free from get_availability('tt', (select day1 from d), 2) where slot_start = (select pg_temp.at_ist(day1, '11:30') from d)),
          1, 'a 2-slot window that touches a booking counts only stations free for the whole window');
select is((select free from get_availability('tt', (select day1 from d)) where slot_start = (select pg_temp.at_ist(day1, '18:00') from d)),
          0, 'a fully booked slot shows 0');
select is((select count(*)::int from get_availability('tt', (select day9 from d))), 0, 'nothing beyond the booking window');
select is((select count(*)::int from get_availability('tt', (select today from d)) where slot_start <= now() and free > 0),
          0, 'slots that have already started show 0 free');
select is(pg_get_function_result('get_availability(text,date,int,boolean)'::regprocedure),
          'TABLE(slot_start timestamp with time zone, free integer)', 'availability returns counts only, no customer data');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is((select free from get_availability('tt', (select day1 from d), 1, true) where slot_start = (select pg_temp.at_ist(day1, '10:00') from d)),
          3, 'the staff view also counts the walk-in-only station');
reset role;
update opening_hours set closed = true where weekday = extract(dow from (select day2 from d))::int;
set local role authenticated;
select is((select count(*)::int from get_availability('tt', (select day2 from d))), 0, 'a closed day has no slots');
reset role;
update opening_hours set closed = false;

-- E. cancel and reschedule ----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into bk select 'c1_16', create_booking('tt', pg_temp.at_ist(day1, '16:00'), 1) from d;

select throws_ok(format($$select cancel_booking(%s)$$, (select id from bk where name = 'raj12')),
                 'Booking not found', 'a customer cannot cancel someone else''s booking');
select lives_ok(format($$select reschedule_booking(%s, pg_temp.at_ist((select day1 from d), '17:00'))$$, (select id from bk where name = 'c1_16')),
                'a customer can move their own booking');
reset role;
select is((select start_at from bookings where id = (select id from bk where name = 'c1_16')), (select pg_temp.at_ist(day1, '17:00') from d),
          'the booking moved');
set local role authenticated;
select throws_like(format($$select reschedule_booking(%s, pg_temp.at_ist((select day1 from d), '18:00'))$$, (select id from bk where name = 'c1_16')),
                   'Slot just taken%', 'moving into a full slot is refused');
select throws_ok(format($$select reschedule_booking(%s, pg_temp.at_ist((select day1 from d), '17:10'))$$, (select id from bk where name = 'c1_16')),
                 'Start time must be on a 30 minute boundary', 'rescheduling follows the same rules');
select lives_ok(format($$select cancel_booking(%s)$$, (select id from bk where name = 'c1_16')), 'a customer can cancel before the cutoff');
select throws_ok(format($$select cancel_booking(%s)$$, (select id from bk where name = 'c1_16')),
                 'Only a confirmed booking can be cancelled', 'a cancelled booking cannot be cancelled again');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select create_booking('tt', pg_temp.at_ist((select day1 from d), '17:00'), 1)$$, 'after a cancel the slot is free again');
reset role;

-- inside the cutoff: customers are refused, staff are not
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Cust One'), 'tt', (select id from stations where name = 'T-A'),
       date_trunc('minute', now()) + interval '1 hour', date_trunc('minute', now()) + interval '2 hours', 2, 'online';
insert into bk select 'soon', max(id) from bookings;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select throws_like(format($$select cancel_booking(%s)$$, (select id from bk where name = 'soon')),
                   'Too late to cancel online%', 'a customer cannot cancel inside the cutoff');
select throws_like(format($$select reschedule_booking(%s, pg_temp.at_ist((select day1 from d), '13:00'))$$, (select id from bk where name = 'soon')),
                   'Too late to change online%', 'a customer cannot reschedule inside the cutoff');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select lives_ok(format($$select cancel_booking(%s)$$, (select id from bk where name = 'soon')), 'staff can cancel at any time');
reset role;

-- H. who can see and write what ---------------------------------------------------------------------------------------
insert into bk select 'c1_count', count(*) from bookings where customer_id = (select id from customers where name = 'Cust One');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from bookings), (select id::int from bk where name = 'c1_count'), 'a customer sees only their own bookings');
select is((select count(*)::int from customers), 1, 'and only their own customer record');
select throws_ok($$update bookings set status = 'confirmed'$$, '42501', null, 'a customer cannot write bookings directly');
select throws_ok($$delete from bookings$$, '42501', null, 'a customer cannot delete bookings');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select ok((select count(*) from bookings) > (select id from bk where name = 'c1_count'), 'staff see everyone''s bookings');
select throws_ok($$insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
                   select 1, 'tt', 1, now(), now() + interval '1 hour', 2, 'counter'$$, '42501', null, 'staff cannot insert bookings directly');
select throws_ok($$update bookings set station_id = station_id$$, '42501', null, 'staff cannot update bookings directly');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select count(*) from bookings$$, '42501', null, 'an anonymous visitor cannot read bookings');
select throws_ok($$select count(*) from customers$$, '42501', null, 'nor customers');
reset role;

-- F. check-in -------------------------------------------------------------------------------------------------------
delete from sessions; delete from bookings;
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Cust One'), 'tt', (select id from stations where name = 'T-A'),
       now() + interval '10 minutes', now() + interval '70 minutes', 2, 'online';
insert into bk select 'ci', max(id) from bookings;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format($$select check_in_booking(%s)$$, (select id from bk where name = 'ci')), '42501', null,
                 'a customer cannot check themselves in');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
insert into bk select 'sess', check_in_booking((select id from bk where name = 'ci'));
reset role;
select is((select status::text from bookings where id = (select id from bk where name = 'ci')), 'checked_in', 'check-in marks the booking checked in');
select is((select s.station_id from sessions s where s.id = (select id from bk where name = 'sess')),
          (select id from stations where name = 'T-A'), 'the session starts on the booked station');
select is((select status::text from sessions where id = (select id from bk where name = 'sess')), 'running', 'and its timer is running');
select is((select booking_id from sessions where id = (select id from bk where name = 'sess')),
          (select id from bk where name = 'ci'), 'the session remembers its booking');
select is((select customer_name from sessions where id = (select id from bk where name = 'sess')), 'Cust One', 'with the customer name on it');
set local role authenticated;
select throws_ok(format($$select check_in_booking(%s)$$, (select id from bk where name = 'ci')),
                 'Only a confirmed booking can be checked in', 'a booking cannot be checked in twice');
reset role;

update sessions set status = 'billed' where id = (select id from bk where name = 'sess');
select is((select status::text from bookings where id = (select id from bk where name = 'ci')), 'completed',
          'billing the session completes the booking');

insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Cust Two'), 'tt', (select id from stations where name = 'T-B'),
       now() + interval '2 hours', now() + interval '3 hours', 2, 'online';
insert into bk select 'early', max(id) from bookings;
set local role authenticated;
select throws_like(format($$select check_in_booking(%s)$$, (select id from bk where name = 'early')),
                   'Too early to check in%', 'check-in is refused more than 15 minutes early');
reset role;

insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Cust Three'), 'tt', (select id from stations where name = 'T-W'),
       now() + interval '5 minutes', now() + interval '65 minutes', 2, 'online';
insert into bk select 'busy', max(id) from bookings;
set local role authenticated;
select start_session((select id from stations where name = 'T-W'));   -- a walk-in is still using the station
select throws_like(format($$select check_in_booking(%s)$$, (select id from bk where name = 'busy')),
                   'The station still has an open session%', 'check-in is refused while the booked station is in use');
reset role;

-- cancelling the session of a checked-in booking cancels the booking
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Cust Two'), 'tt', (select id from stations where name = 'T-A'),
       now() + interval '5 minutes', now() + interval '65 minutes', 2, 'online';
insert into bk select 'ci2', max(id) from bookings;
set local role authenticated;
insert into bk select 'sess2', check_in_booking((select id from bk where name = 'ci2'));
reset role;
update sessions set status = 'cancelled' where id = (select id from bk where name = 'sess2');
select is((select status::text from bookings where id = (select id from bk where name = 'ci2')), 'cancelled',
          'cancelling the session cancels the booking');

-- G. no-shows ---------------------------------------------------------------------------------------------------------------
delete from sessions; delete from bookings;
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel, status)
select (select id from customers where name = 'Cust One'), 'tt', (select id from stations where name = 'T-A'),
       now() - interval '20 minutes', now() + interval '40 minutes', 2, 'online'::booking_channel, 'confirmed'::booking_status
union all
select (select id from customers where name = 'Cust Two'), 'tt', (select id from stations where name = 'T-B'),
       now() - interval '5 minutes', now() + interval '55 minutes', 2, 'online'::booking_channel, 'confirmed'::booking_status
union all
select (select id from customers where name = 'Cust Three'), 'tt', (select id from stations where name = 'T-W'),
       now() - interval '20 minutes', now() + interval '40 minutes', 2, 'online'::booking_channel, 'checked_in'::booking_status;

select is(release_no_shows(), 1, 'the job marks only the booking that is past start + 15 minutes');
select is((select b.status::text from bookings b join stations s on s.id = b.station_id where s.name = 'T-A'), 'no_show', 'the overdue booking is a no-show');
select is((select b.status::text from bookings b join stations s on s.id = b.station_id where s.name = 'T-B'), 'confirmed', 'a booking inside the grace period stays confirmed');
select is((select b.status::text from bookings b join stations s on s.id = b.station_id where s.name = 'T-W'), 'checked_in', 'a checked-in booking is never released');
select lives_ok($$
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
  select (select id from customers where name = 'Cust Two'), 'tt', (select id from stations where name = 'T-A'),
         now() - interval '10 minutes', now() + interval '50 minutes', 2, 'counter'$$,
  'after the no-show the station is free for a new booking');
select is(release_no_shows(), 0, 'running the job again changes nothing');
select ok(not exists (select 1 from pg_extension where extname = 'pg_cron')
          or exists (select 1 from cron.job where jobname = 'release-no-shows' and schedule = '*/5 * * * *'),
          'the no-show job is scheduled every 5 minutes (when pg_cron is enabled)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select release_no_shows()$$, '42501', null, 'the job function is not callable from the app');
select lives_ok(format($$select mark_no_show(%s)$$, (select id from bookings b where b.station_id = (select id from stations where name = 'T-B'))),
                'staff can mark a booking that has started as a no-show');
reset role;
select is((select status::text from bookings where station_id = (select id from stations where name = 'T-B')), 'no_show', 'it is now a no-show');
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel)
select (select id from customers where name = 'Cust One'), 'tt', (select id from stations where name = 'T-B'),
       now() + interval '3 hours', now() + interval '4 hours', 2, 'online';
insert into bk select 'future', max(id) from bookings;
set local role authenticated;
select throws_ok(format($$select mark_no_show(%s)$$, (select id from bk where name = 'future')),
                 'Too early to mark a no-show', 'a booking that has not started cannot be marked a no-show');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select throws_ok(format($$select mark_no_show(%s)$$, (select id from bk where name = 'future')), '42501', null,
                 'a customer cannot mark no-shows');
reset role;

select * from finish();
rollback;
