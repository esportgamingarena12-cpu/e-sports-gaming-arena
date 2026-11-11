begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'staff-em@t.dev'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'cust-em@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b4', 'Staff', 'staff', true)
on conflict (id) do update set role = 'staff', active = true;

update booking_settings set slot_minutes = 30, window_days = 7, min_slots = 1, max_slots = 8, cutoff_hours = 2, grace_minutes = 15;
update opening_hours set open_time = '10:00', close_time = '22:00', closed = false;

create temp table d (day1 date);
insert into d select (now() at time zone 'Asia/Kolkata')::date + 1;
create function pg_temp.at_ist(dt date, hhmm text) returns timestamptz language sql stable as
  $$ select (dt::timestamp + hhmm::time) at time zone 'Asia/Kolkata' $$;
create temp table bk (name text, id bigint);
grant all on d, bk to authenticated, anon;

insert into customers (name, phone, email) values ('Mail Cust', '9666666601', 'mail.cust@t.dev');
insert into customers (name, phone) values ('No Mail', '9666666602');

-- staff books for both
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
insert into bk select 'with_email', create_booking('pc', pg_temp.at_ist(day1, '12:00'), 2, 'Mail Cust', '9666666601', 'phone') from d;
insert into bk select 'no_email', create_booking('pc', pg_temp.at_ist(day1, '12:00'), 2, 'No Mail', '9666666602', 'phone') from d;
reset role;

select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'with_email') and kind = 'created'), 1,
          'a booking for a customer with an email queues a confirmation');
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'no_email')), 0,
          'a customer without an email address gets nothing');
select is((select status from booking_emails where booking_id = (select id from bk where name = 'with_email')), 'pending', 'it starts pending');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
select reschedule_booking((select id from bk where name = 'with_email'), pg_temp.at_ist((select day1 from d), '15:00'));
reset role;
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'with_email') and kind = 'rescheduled'), 1,
          'moving the booking queues a "moved" email');

set local role authenticated;
select cancel_booking((select id from bk where name = 'with_email'));
reset role;
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'with_email') and kind = 'cancelled'), 1,
          'cancelling queues a cancellation email');
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'with_email')), 3, 'exactly three in all');

-- a customer with a login and an email
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
set local role authenticated;
select save_my_profile('Login Cust', '9666666603');
insert into bk select 'login', create_booking('pc', pg_temp.at_ist(day1, '17:00'), 2) from d;
reset role;
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'login') and kind = 'created'), 1,
          'an online booking by a login queues a confirmation');

-- reminders: one booking starting in 30 minutes that was made 2 hours ago
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel, created_at)
select (select id from customers where name = 'Mail Cust'), 'pc', st.id, now() + interval '30 minutes', now() + interval '90 minutes', 2,
       'confirmed', 'phone', now() - interval '2 hours' from stations st where st.name = 'PC 3';
insert into bk select 'soon', id from bookings where start_at <= now() + interval '31 minutes' and status = 'confirmed' and station_id = (select id from stations where name = 'PC 3');
-- one made just now for a start 30 minutes ahead: no reminder (the confirmation is enough)
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel)
select (select id from customers where name = 'Mail Cust'), 'pc', st.id, now() + interval '30 minutes', now() + interval '90 minutes', 2, 'confirmed', 'phone'
  from stations st where st.name = 'PC 2';
insert into bk select 'fresh', id from bookings where station_id = (select id from stations where name = 'PC 2') and start_at <= now() + interval '31 minutes';
-- a late one for a customer without an email, and one more than an hour away
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel, created_at)
select (select id from customers where name = 'No Mail'), 'pc', st.id, now() + interval '30 minutes', now() + interval '90 minutes', 2, 'confirmed', 'phone', now() - interval '2 hours'
  from stations st where st.name = 'PC 1';
insert into bk select 'noemail_soon', id from bookings where station_id = (select id from stations where name = 'PC 1') and start_at <= now() + interval '31 minutes';
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel, created_at)
select (select id from customers where name = 'Mail Cust'), 'ps5', st.id, now() + interval '3 hours', now() + interval '4 hours', 2, 'confirmed', 'phone', now() - interval '5 hours'
  from stations st where st.name = 'PS5 1';
insert into bk select 'later', id from bookings where station_id = (select id from stations where name = 'PS5 1') and start_at > now() + interval '2 hours';

select run_booking_mail();
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'soon') and kind = 'reminder'), 1,
          'a booking starting within the hour gets one reminder');
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'fresh') and kind = 'reminder'), 0,
          'no reminder for a booking made less than an hour before it starts');
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'noemail_soon')), 0, 'none for a customer without an email');
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'later') and kind = 'reminder'), 0, 'none yet for one more than an hour away');
select ok((select reminder_sent_at from bookings where id = (select id from bk where name = 'soon')) is not null, 'the reminder is recorded on the booking');
select run_booking_mail();
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'soon') and kind = 'reminder'), 1, 'running the job again does not repeat it');

update bookings set start_at = start_at + interval '20 minutes', end_at = end_at + interval '20 minutes' where id = (select id from bk where name = 'soon');
select ok((select reminder_sent_at from bookings where id = (select id from bk where name = 'soon')) is null, 'moving a booking resets its reminder');
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'soon') and kind = 'rescheduled'), 1, 'and queues a "moved" email');

update bookings set status = 'cancelled', cancelled_at = now() where id = (select id from bk where name = 'soon');
select run_booking_mail();
select is((select count(*)::int from booking_emails where booking_id = (select id from bk where name = 'soon') and kind = 'reminder'), 1, 'a cancelled booking is not reminded again');

-- nobody but the server can see the outbox or the sender settings
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from booking_emails$$, '42501', null, 'customers cannot read the outbox');
select throws_ok($$select * from mail_config$$, '42501', null, 'customers cannot read the sender settings');
select throws_ok($$select run_booking_mail()$$, '42501', null, 'customers cannot run the mail job');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from booking_emails$$, '42501', null, 'staff cannot read the outbox');
select throws_ok($$select * from mail_config$$, '42501', null, 'staff cannot read the sender settings');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from booking_emails$$, '42501', null, 'visitors cannot read the outbox');
select throws_ok($$select * from mail_config$$, '42501', null, 'visitors cannot read the sender settings');
reset role;

select * from finish();
rollback;
