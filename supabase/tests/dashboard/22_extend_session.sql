-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0021 (extend_session). It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Read the lines in the message: every line should start with "ok". Any line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  v_pkg bigint;
  v_hr  bigint;
  v_end bigint;
  v_t   timestamptz;
  err   text;
  state text;
  bad   int;
begin
  -- test data (rolled back at the end)
  insert into auth.users (id, aud, role, email) values
    ('00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'staff-ex@t.dev'),
    ('00000000-0000-0000-0000-0000000000ab', 'authenticated', 'authenticated', 'cust-ex@t.dev')
  on conflict do nothing;
  insert into profiles (id, full_name, role, active) values
    ('00000000-0000-0000-0000-0000000000aa', 'Staff', 'staff', true),
    ('00000000-0000-0000-0000-0000000000ab', 'Cust', 'customer', true)
  on conflict (id) do update set role = excluded.role, active = true;
  insert into stations (name, type, rate_per_hour, sort_order) values
    ('T22 PC A', 'pc', 60, 951), ('T22 PC B', 'pc', 60, 952), ('T22 PC C', 'pc', 60, 953), ('T22 PS A', 'ps5', 110, 954);
  insert into packages (name, minutes, price, station_type, active) values
    ('T22 P30', 30, 50, 'pc', true), ('T22 P60', 60, 90, 'pc', true), ('T22 Old', 30, 40, 'pc', false), ('T22 PS30', 30, 60, 'ps5', true);

  -- act as the staff user
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  set local role authenticated;
  v_pkg := start_session((select id from stations where name = 'T22 PC A'), (select id from packages where name = 'T22 P30'));
  v_hr  := start_session((select id from stations where name = 'T22 PC B'));
  v_end := start_session((select id from stations where name = 'T22 PC C'), (select id from packages where name = 'T22 P30'));

  -- a package session is extended by adding a package
  perform extend_session(v_pkg, (select id from packages where name = 'T22 P60'));
  reset role;
  res := pg_temp.chk(res, (select package_minutes from sessions where id = v_pkg) = 90, 'package: minutes are added (30 + 60 = 90)');
  res := pg_temp.chk(res, (select package_price from sessions where id = v_pkg) = 140, 'package: prices are added (50 + 90 = 140)');
  res := pg_temp.chk(res, (select package_name from sessions where id = v_pkg) = 'T22 P30 + T22 P60', 'package: the name shows both');
  select started_at into v_t from sessions where id = v_pkg;
  res := pg_temp.chk(res, session_charge(v_pkg, v_t + interval '80 minutes') = 140, 'bill inside the combined time is the combined price (140)');
  res := pg_temp.chk(res, session_charge(v_pkg, v_t + interval '100 minutes') > 140, 'bill beyond the combined time adds overtime');

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  set local role authenticated;
  perform extend_session(v_pkg, (select id from packages where name = 'T22 P30'));
  reset role;
  res := pg_temp.chk(res, (select package_price from sessions where id = v_pkg) = 190, 'a second extension adds again (140 + 50 = 190)');

  -- refusals
  set local role authenticated;
  begin perform extend_session(v_pkg, (select id from packages where name = 'T22 PS30')); err := null;
  exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%not for this station type%', 'a package for another station type is refused');
  set local role authenticated;
  begin perform extend_session(v_pkg, (select id from packages where name = 'T22 Old')); err := null;
  exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%not found or inactive%', 'an inactive package is refused');
  set local role authenticated;
  begin perform extend_session(v_pkg); err := null;
  exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%Choose the package%', 'a package session needs a package');

  -- a per-hour session keeps per-hour billing; the reminder moves
  perform extend_session(v_hr, null, 30);
  reset role;
  res := pg_temp.chk(res, (select alarm_minutes from sessions where id = v_hr) = 30, 'per hour: with no timer, one is set 30 minutes from now');
  set local role authenticated;
  perform extend_session(v_hr, null, 30);
  reset role;
  res := pg_temp.chk(res, (select alarm_minutes + alarm_extra_minutes from sessions where id = v_hr) = 60, 'per hour: extended again, the reminder is at 60 minutes');
  res := pg_temp.chk(res, (select package_minutes from sessions where id = v_hr) is null, 'per hour: billing stays per hour (no package added)');
  set local role authenticated;
  begin perform extend_session(v_hr, null, 0); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%1 to 600%', 'per hour: zero minutes is refused');
  set local role authenticated;
  begin perform extend_session(v_hr, null, 601); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%1 to 600%', 'per hour: more than 600 minutes is refused');

  -- a stopped (not billed) session comes back to running
  perform end_session(v_end);
  reset role;
  res := pg_temp.chk(res, (select status::text from sessions where id = v_end) = 'ended', 'the third session was stopped');
  set local role authenticated;
  perform extend_session(v_end, (select id from packages where name = 'T22 P60'));
  reset role;
  res := pg_temp.chk(res, (select status::text from sessions where id = v_end) = 'running', 'extending a stopped session brings it back to running');
  res := pg_temp.chk(res, (select ended_at is null from sessions where id = v_end), '...with no end time');
  res := pg_temp.chk(res, (select package_minutes from sessions where id = v_end) = 90, '...and the package time added');

  -- who may call it
  set local role anon;
  begin perform extend_session(v_hr, null, 30); err := null; state := null; exception when others then err := sqlerrm; state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot extend a session');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
  set local role authenticated;
  begin perform extend_session(v_hr, null, 30); err := null; state := null; exception when others then err := sqlerrm; state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a customer cannot extend a session');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
