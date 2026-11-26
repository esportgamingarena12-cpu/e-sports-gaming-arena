-- Paste this whole file into the Supabase dashboard SQL editor and press Run (AFTER migration 0034 is applied).
-- It checks Happy hours: which discount runs at which moment (India time), the master switch, off-dates, overlapping rules,
-- the limits on a rule, who may change rules, what a visitor may see, and that a session started in a happy hour is priced
-- at the discount and keeps it (also when extended) while a session started outside one is not touched.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so no rule, station, session or bill stays.
-- Every line should start with "ok"; "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  adm   uuid := '00000000-0000-0000-0000-0000000000a1';
  stf   uuid := '00000000-0000-0000-0000-0000000000a2';
  r     record;
  j     jsonb;
  ok    boolean;
  n     int;
  bad   int;
  v_pc  bigint;
  v_ps  bigint;
  v_pk  bigint;
  v_s1  bigint;
  v_s2  bigint;
  v_s3  bigint;
  v_s4  bigint;
  v_bill bigint;
  v_item text;
  v_rule2 bigint;
  v_rule3 bigint;
  -- a Monday at 3 pm India time and nearby moments
  mon   date := '2026-11-23';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (adm, 'authenticated', 'authenticated', 'admin-hh@t.dev', '{}'),
    (stf, 'authenticated', 'authenticated', 'staff-hh@t.dev', '{}')
  on conflict do nothing;
  update profiles set role = 'admin' where id = adm;
  update profiles set role = 'staff' where id = stf;

  -- the test's own stations and package (nothing else is touched)
  insert into stations (name, type, rate_per_hour, sort_order) values ('T32 PC', 'pc', 100, 991), ('T32 PS', 'ps5', 200, 992);
  select id into v_pc from stations where name = 'T32 PC';
  select id into v_ps from stations where name = 'T32 PS';
  insert into packages (name, minutes, price, station_type) values ('T32 PC 1 Hour', 60, 90, 'pc');
  select id into v_pk from packages where name = 'T32 PC 1 Hour';

  -- ===== rules, as the Admin =====
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  insert into happy_hours (name, days, start_time, end_time, percent, station_type)
    values ('T32 weekday afternoon', '{1,2,3,4,5}', '15:00', '18:00', 20, null);
  insert into happy_hours (name, days, start_time, end_time, percent, station_type)
    values ('T32 late PC', '{0,1,2,3,4,5,6}', '21:00', '22:00', 50, 'pc');
  update settings set happy_hours_on = true where id = true;
  get diagnostics n = row_count;
  reset role;
  res := pg_temp.chk(res, n = 1, 'the Admin can switch happy hours on and add rules');

  -- ===== which discount runs when (all times India time) =====
  select percent, name into r from happy_hour_at('pc', (mon || ' 15:00:00+05:30')::timestamptz);
  res := pg_temp.chk(res, r.percent = 20 and r.name = 'T32 weekday afternoon', 'Monday 3:00 pm: the start time is inside (20% off)');
  res := pg_temp.chk(res, (select count(*) from happy_hour_at('pc', (mon || ' 14:59:59+05:30')::timestamptz)) = 0, 'Monday 2:59 pm: nothing yet');
  res := pg_temp.chk(res, (select percent from happy_hour_at('ps5', (mon || ' 17:59:59+05:30')::timestamptz)) = 20, 'Monday 5:59:59 pm: still inside');
  res := pg_temp.chk(res, (select count(*) from happy_hour_at('pc', (mon || ' 18:00:00+05:30')::timestamptz)) = 0, 'Monday 6:00 pm: the end time is outside');
  res := pg_temp.chk(res, (select count(*) from happy_hour_at('pc', ('2026-11-28 16:00:00+05:30')::timestamptz)) = 0, 'Saturday 4 pm: the day is not ticked, so nothing');
  res := pg_temp.chk(res, (select percent from happy_hour_at('pc', (mon || ' 21:30:00+05:30')::timestamptz)) = 50, 'a PC-only rule gives PC 50% off at 9:30 pm');
  res := pg_temp.chk(res, (select count(*) from happy_hour_at('ps5', (mon || ' 21:30:00+05:30')::timestamptz)) = 0, 'and PS5 nothing');
  -- India time, not server time: 9:45 pm India is 16:15 UTC
  res := pg_temp.chk(res, (select percent from happy_hour_at('pc', ('2026-11-23 16:15:00+00')::timestamptz)) = 50, 'the clock used is India time (9:45 pm IST = 16:15 UTC)');

  -- overlapping rules: the biggest wins, they do not add up
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  insert into happy_hours (name, days, start_time, end_time, percent, station_type)
    values ('T32 overlap', '{1}', '16:00', '17:00', 30, 'pc') returning id into v_rule2;
  reset role;
  res := pg_temp.chk(res, (select percent from happy_hour_at('pc', (mon || ' 16:30:00+05:30')::timestamptz)) = 30, 'overlapping rules: the biggest percent wins for PC (30)');
  res := pg_temp.chk(res, (select percent from happy_hour_at('ps5', (mon || ' 16:30:00+05:30')::timestamptz)) = 20, 'and the other game type keeps its own rule (20)');
  update happy_hours set active = false where id = v_rule2;
  res := pg_temp.chk(res, (select percent from happy_hour_at('pc', (mon || ' 16:30:00+05:30')::timestamptz)) = 20, 'a switched-off rule is ignored');

  -- off-dates (holidays)
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  insert into happy_hour_off_dates (day, label) values (mon, 'T32 holiday');
  reset role;
  res := pg_temp.chk(res, (select count(*) from happy_hour_at('pc', (mon || ' 16:00:00+05:30')::timestamptz)) = 0, 'on an off-date nothing runs, even inside the window');
  res := pg_temp.chk(res, (select percent from happy_hour_at('pc', ('2026-11-24 16:00:00+05:30')::timestamptz)) = 20, 'the next day is not affected');
  delete from happy_hour_off_dates where day = mon;

  -- master switch
  update settings set happy_hours_on = false where id = true;
  res := pg_temp.chk(res, (select count(*) from happy_hour_at('pc', (mon || ' 16:00:00+05:30')::timestamptz)) = 0, 'with the master switch off nothing runs');
  update settings set happy_hours_on = true where id = true;

  -- ===== limits on a rule =====
  ok := false; begin insert into happy_hours (name, days, start_time, end_time, percent) values ('x', '{1}', '18:00', '15:00', 10); exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'an end time before the start time is refused (no rule across midnight)');
  ok := false; begin insert into happy_hours (name, days, start_time, end_time, percent) values ('x', '{1}', '15:00', '18:00', 0); exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, '0% is refused');
  ok := false; begin insert into happy_hours (name, days, start_time, end_time, percent) values ('x', '{1}', '15:00', '18:00', 91); exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'more than 90% is refused');
  ok := false; begin insert into happy_hours (name, days, start_time, end_time, percent) values ('x', '{}', '15:00', '18:00', 10); exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'a rule with no days is refused');
  ok := false; begin insert into happy_hours (name, days, start_time, end_time, percent) values ('x', '{7}', '15:00', '18:00', 10); exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'a day number outside 0 to 6 is refused');
  ok := false; begin insert into happy_hours (name, days, start_time, end_time, percent) values ('  ', '{1}', '15:00', '18:00', 10); exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'an empty name is refused');

  -- ===== who may change rules =====
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  ok := false;
  begin insert into happy_hours (name, days, start_time, end_time, percent) values ('staff rule', '{1}', '10:00', '11:00', 10); exception when others then ok := true; end;
  res := pg_temp.chk(res, ok, 'a staff member cannot add a rule');
  update settings set happy_hours_on = false where id = true;
  get diagnostics n = row_count;
  res := pg_temp.chk(res, n = 0, 'a staff member cannot use the master switch');
  select count(*) into n from happy_hours;
  res := pg_temp.chk(res, n >= 2, 'but staff can read the rules (to see them at the counter)');
  reset role;
  set local role anon;
  ok := false; begin perform count(*) from happy_hours; exception when others then ok := true; end;
  res := pg_temp.chk(res, ok, 'a visitor cannot read the rules table');
  ok := false; begin perform * from happy_hour_at('pc'); exception when others then ok := true; end;
  res := pg_temp.chk(res, ok, 'a visitor cannot call the discount check');
  j := happy_hours_info();
  reset role;
  res := pg_temp.chk(res, j->>'on' = 'true' and jsonb_array_length(j->'rules') >= 2 and (select count(*) from jsonb_object_keys(j)) = 3, 'a visitor can read the public happy hours (on, rules, off-dates)');
  res := pg_temp.chk(res, not (j::text ~* 'upi|password|secret|phone|gstin|rate_per_hour|price'), 'and it shows nothing private and no prices');
  update settings set happy_hours_on = false where id = true;
  set local role anon; j := happy_hours_info(); reset role;
  res := pg_temp.chk(res, j->>'on' = 'false' and jsonb_array_length(j->'rules') = 0, 'with the master switch off a visitor sees no happy hours at all');
  update settings set happy_hours_on = true where id = true;

  -- ===== sessions: priced when they start =====
  -- a rule that is running right now, for PC only
  delete from happy_hours;
  insert into happy_hours (name, days, start_time, end_time, percent, station_type)
    values ('T32 all day PC', '{0,1,2,3,4,5,6}', '00:00', '23:59:59', 20, 'pc');

  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_s1 := start_session(v_pc);                -- per hour, PC, inside the happy hour
  reset role;
  select * into r from sessions where id = v_s1;
  res := pg_temp.chk(res, r.rate_per_hour = 80 and r.happy_pct = 20 and r.happy_name = 'T32 all day PC', 'a per-hour PC session started in a happy hour saves the discounted rate (100 -> 80) and the discount');
  update stations set active = true where id = v_pc;

  -- the same station needs to be free again for the next test
  update sessions set status = 'cancelled' where id = v_s1;

  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_s2 := start_session(v_pc, v_pk);          -- package, PC
  reset role;
  select * into r from sessions where id = v_s2;
  res := pg_temp.chk(res, r.package_price = 72 and r.rate_per_hour = 80 and r.happy_pct = 20, 'a package session saves the discounted price (90 -> 72) and the discounted hourly rate for overtime');
  res := pg_temp.chk(res, session_charge(v_s2) = 72, 'inside the package the charge is the discounted package price');

  -- extending adds the package at the session's own discount
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  perform extend_session(v_s2, v_pk);
  reset role;
  select * into r from sessions where id = v_s2;
  res := pg_temp.chk(res, r.package_price = 144 and r.package_minutes = 120, 'extending adds the package at the same discount (72 + 72 = 144 for 120 minutes)');

  -- changing the rule later does not touch a running session
  update happy_hours set percent = 50;
  select * into r from sessions where id = v_s2;
  res := pg_temp.chk(res, r.package_price = 144 and r.happy_pct = 20, 'changing the rule afterwards does not change a running session');

  -- the bill says so
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  perform end_session(v_s2);
  select checkout_bill(jsonb_build_object('session_id', v_s2, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 144)))) into v_bill;
  reset role;
  select name into v_item from bill_items where bill_no = v_bill and kind = 'gaming';
  res := pg_temp.chk(res, v_item like '%Happy hour 20% off%', 'the bill line says "Happy hour 20% off"');
  res := pg_temp.chk(res, (select total = 144 and gaming_charge = 144 from bills where bill_no = v_bill), 'and the bill total is the discounted amount (144)');

  -- other game type: not in this rule, so full price
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_s3 := start_session(v_ps);
  reset role;
  select * into r from sessions where id = v_s3;
  res := pg_temp.chk(res, r.rate_per_hour = 200 and r.happy_pct = 0 and r.happy_name is null, 'a PS5 session is not in the PC rule: full price, no discount');

  -- master switch off: full price
  update settings set happy_hours_on = false where id = true;
  update sessions set status = 'cancelled' where id = v_s3;
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_s4 := start_session(v_ps);
  reset role;
  select * into r from sessions where id = v_s4;
  res := pg_temp.chk(res, r.rate_per_hour = 200 and r.happy_pct = 0, 'with the master switch off a new session is full price');

  -- passes are not discounted
  res := pg_temp.chk(res, (select count(*) from sessions where pass_id is not null and happy_pct > 0) = 0, 'no pass session ever carries a happy-hour discount');
  res := pg_temp.chk(res, (select count(*) from sessions where happy_pct > 0 and id not in (v_s1, v_s2)) = 0, 'and no other session picked up a discount');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
