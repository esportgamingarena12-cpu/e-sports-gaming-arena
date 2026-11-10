begin;
select plan(9);

-- fixtures ------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-charge@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = 'staff', active = true;

insert into stations (name, type, rate_per_hour) values ('T-PS5', 'ps5', 120), ('T-PC', 'pc', 60);

-- Direct inserts as superuser. Status 'billed' keeps them out of the one-open-session index.
-- customer_name is used as the label of each worked example.
insert into sessions (station_id, customer_name, rate_per_hour, block_min, min_bill_min,
                      package_minutes, package_price, started_at, status)
select st.id, v.label, st.rate_per_hour, 15, 30, v.m, v.p, '2026-01-01 10:00+00', 'billed'
  from (values
    ('ex1', 'T-PS5', null::int, null::numeric),
    ('ex2', 'T-PC',  null, null),
    ('ex3', 'T-PC',  null, null),
    ('ex4', 'T-PC',  180, 150),
    ('ex5', 'T-PC',  180, 150)
  ) v(label, sname, m, p)
  join stations st on st.name = v.sname;

select is(session_charge((select id from sessions where customer_name = 'ex1'), '2026-01-01 10:47+00'),
          120.00::numeric, 'PS5 per hour, 47 min -> 60 min x 120 = 120');
select is(session_charge((select id from sessions where customer_name = 'ex2'), '2026-01-01 10:10+00'),
          30.00::numeric, 'PC per hour, 10 min -> minimum 30 min x 60 = 30');
select is(session_charge((select id from sessions where customer_name = 'ex3'), '2026-01-01 11:31+00'),
          105.00::numeric, 'PC per hour, 1h31 -> 105 min x 60 = 105');
select is(session_charge((select id from sessions where customer_name = 'ex4'), '2026-01-01 12:50+00'),
          150.00::numeric, 'PC 3 Hours, 2h50 within package = 150');
select is(session_charge((select id from sessions where customer_name = 'ex5'), '2026-01-01 13:21+00'),
          180.00::numeric, 'PC 3 Hours, 3h21 -> 150 + 30 overtime = 180');

-- paused time is not charged: 47 min elapsed, 17 paused -> 30 played -> 30 min x 120 = 60
update sessions set paused_seconds = 17 * 60 where customer_name = 'ex1';
select is(session_charge((select id from sessions where customer_name = 'ex1'), '2026-01-01 10:47+00'),
          60.00::numeric, 'paused time is not charged (30 min played x 120 = 60)');

-- a pause still in progress also stops the meter
update sessions set paused_seconds = 0, paused_at = '2026-01-01 10:30+00' where customer_name = 'ex1';
select is(session_charge((select id from sessions where customer_name = 'ex1'), '2026-01-01 12:00+00'),
          60.00::numeric, 'running pause stops the meter (30 min played x 120 = 60)');

-- rate snapshot: changing the station rate after start does not change a running session
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select start_session((select id from stations where name = 'T-PC'))$$,
                'staff can start a session');
reset role;
update stations set rate_per_hour = 999 where name = 'T-PC';
select is((select rate_per_hour from sessions
            where station_id = (select id from stations where name = 'T-PC') and status = 'running'),
          60.00::numeric, 'running session keeps the rate from start time');

select * from finish();
rollback;
