begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-bs@t.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-bs@t.dev'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'cust-bs@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin',    'admin',    true),
  ('00000000-0000-0000-0000-0000000000b2', 'Staff',    'staff',    true),
  ('00000000-0000-0000-0000-0000000000c3', 'Customer', 'customer', true)
on conflict (id) do update set role = excluded.role, active = true;

insert into stations (name, type, rate_per_hour) values ('T-PC', 'pc', 60);

-- defaults ------------------------------------------------------------------------
select is((select count(*)::int from booking_settings), 1, 'one booking_settings row');
select is((select count(*)::int from opening_hours), 7, 'seven opening_hours rows');
select is((select slot_minutes from booking_settings), 30, 'default slot size is 30');

-- constraints (as superuser) ---------------------------------------------------------
select throws_ok($$update booking_settings set slot_minutes = 20$$, '23514', null, 'slot size must be 15, 30 or 60');
select throws_ok($$update booking_settings set window_days = 0$$, '23514', null, 'window must be at least 1 day');
select throws_ok($$update booking_settings set min_slots = 5, max_slots = 2$$, '23514', null,
                 'max slots cannot be below min slots');
select throws_ok($$update booking_settings set cutoff_hours = -1$$, '23514', null, 'cutoff cannot be negative');
select throws_ok($$insert into booking_settings (id) values (false)$$, '23514', null,
                 'a second booking_settings row is refused');
select throws_ok($$update opening_hours set open_time = '22:00', close_time = '10:00' where weekday = 1$$,
                 '23514', null, 'open time must be before close time');
select lives_ok($$update opening_hours set closed = true, open_time = '22:00', close_time = '10:00' where weekday = 0$$,
                'a closed day may have any times');

-- admin can update --------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update booking_settings set slot_minutes = 60, window_days = 14;
update opening_hours set open_time = '09:00', close_time = '23:00' where weekday = 2;
reset role;
select is((select slot_minutes from booking_settings), 60, 'admin can change slot size');
select is((select window_days from booking_settings), 14, 'admin can change window days');
select is((select open_time::text from opening_hours where weekday = 2), '09:00:00', 'admin can change opening hours');

-- staff can read, not write -------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from booking_settings), 1, 'staff can read booking settings');
select is((select count(*)::int from opening_hours), 7, 'staff can read opening hours');
update booking_settings set slot_minutes = 15;
update opening_hours set closed = true where weekday = 3;
select throws_ok($$insert into opening_hours (weekday) values (9)$$, '42501', null,
                 'staff cannot insert opening hours');
reset role;
select is((select slot_minutes from booking_settings), 60, 'staff cannot change booking settings');
select is((select closed from opening_hours where weekday = 3), false, 'staff cannot change opening hours');

-- customer sees nothing ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from booking_settings), 0, 'customer cannot read booking settings');
select is((select count(*)::int from opening_hours), 0, 'customer cannot read opening hours');
reset role;

-- rate change does not affect a running session ---------------------------------------------
create temp table ctx (sid bigint);
grant all on ctx to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
insert into ctx select start_session((select id from stations where name = 'T-PC'));
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
update stations set rate_per_hour = 999 where name = 'T-PC';
reset role;
select is((select rate_per_hour from stations where name = 'T-PC'), 999.00::numeric, 'admin changed the station rate');
select is((select rate_per_hour from sessions where id = (select sid from ctx)), 60.00::numeric,
          'running session keeps its rate');
select is(session_charge((select sid from ctx), (select started_at + interval '60 minutes' from sessions
                                                   where id = (select sid from ctx))),
          60.00::numeric, 'charge still uses the old rate (60 min x 60 = 60)');

select * from finish();
rollback;
