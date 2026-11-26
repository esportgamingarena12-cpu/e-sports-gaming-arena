-- Paste this whole file into the Supabase dashboard SQL editor and press Run (AFTER migrations 0034 and 0035 are applied).
-- It checks the "Happy hour discount given" numbers in the sales reports: that a session started in a happy hour remembers the list
-- prices, that the report shows exactly list charge minus what was charged (per hour, package, and an extended package), that a session
-- outside a happy hour is not counted, that the old report numbers are still there, and who may read them.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so no station, session, bill or setting stays.
-- Every line should start with "ok"; "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res    text[] := '{}';
  adm    uuid := '00000000-0000-0000-0000-0000000000b1';
  stf    uuid := '00000000-0000-0000-0000-0000000000b2';
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  j0     jsonb;
  j1     jsonb;
  r      record;
  ok     boolean;
  bad    int;
  v_pc   bigint;
  v_pk   bigint;
  v_a    bigint;
  v_b    bigint;
  v_c    bigint;
  v_d    bigint;
  d_sess numeric;
  d_amt  numeric;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (adm, 'authenticated', 'authenticated', 'admin-hd@t.dev', '{}'),
    (stf, 'authenticated', 'authenticated', 'staff-hd@t.dev', '{}')
  on conflict do nothing;
  update profiles set role = 'admin' where id = adm;
  update profiles set role = 'staff' where id = stf;

  update settings set min_bill_min = 30, billing_block_min = 15, happy_hours_on = true;
  insert into stations (name, type, rate_per_hour, sort_order) values ('T33 PC', 'pc', 100, 993);
  select id into v_pc from stations where name = 'T33 PC';
  insert into packages (name, minutes, price, station_type) values ('T33 PC 1 Hour', 60, 90, 'pc');
  select id into v_pk from packages where name = 'T33 PC 1 Hour';
  insert into happy_hours (name, days, start_time, end_time, percent, station_type)
    values ('T33 all day', '{0,1,2,3,4,5,6}', '00:00', '23:59:59', 20, 'pc');

  -- the numbers before the test sessions
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  j0 := sales_report(today, today);
  reset role;
  res := pg_temp.chk(res, j0 ? 'happy_sessions' and j0 ? 'happy_discount', 'the report has the two happy hour numbers');
  res := pg_temp.chk(res, j0 ? 'net_sales' and j0 ? 'gaming' and j0 ? 'passes' and j0 ? 'daily' and j0 ? 'top_items' and j0 ? 'payments', 'and every old report number is still there');

  -- A: a package in a happy hour (90 -> 72, discount 18)
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_a := start_session(v_pc, v_pk);
  perform end_session(v_a);
  perform checkout_bill(jsonb_build_object('session_id', v_a, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 72))));
  reset role;
  select * into r from sessions where id = v_a;
  res := pg_temp.chk(res, r.list_package_price = 90 and r.list_rate_per_hour = 100 and r.package_price = 72 and r.rate_per_hour = 80, 'a session started in a happy hour remembers the list prices (90 and 100) next to the discounted ones (72 and 80)');

  -- B: per hour in a happy hour, stopped at once: the 30 minute minimum bill, 30 min at 80/hr = 40 against 50 at the list rate (discount 10)
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_b := start_session(v_pc);
  perform end_session(v_b);
  perform checkout_bill(jsonb_build_object('session_id', v_b, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 40))));
  reset role;
  res := pg_temp.chk(res, session_list_charge(v_b, (select ended_at from sessions where id = v_b)) = 50, 'a per-hour session: the list charge is 50 (30 minutes at 100 an hour)');

  -- D: a package that is extended in a happy hour: 72 + 72 = 144 against 90 + 90 = 180 (discount 36)
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_d := start_session(v_pc, v_pk);
  perform extend_session(v_d, v_pk);
  perform end_session(v_d);
  perform checkout_bill(jsonb_build_object('session_id', v_d, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 144))));
  reset role;
  select * into r from sessions where id = v_d;
  res := pg_temp.chk(res, r.list_package_price = 180 and r.package_price = 144, 'an extended package keeps adding at both prices (list 180, charged 144)');

  -- C: not in a happy hour (switched off): full price, not counted
  update settings set happy_hours_on = false;
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  v_c := start_session(v_pc);
  perform end_session(v_c);
  perform checkout_bill(jsonb_build_object('session_id', v_c, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 50))));
  reset role;
  select * into r from sessions where id = v_c;
  res := pg_temp.chk(res, r.happy_pct = 0 and r.list_rate_per_hour is null and r.list_package_price is null, 'a session outside a happy hour has no list prices and no discount');

  -- the report after
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  j1 := sales_report(today, today);
  reset role;
  d_sess := (j1->>'happy_sessions')::numeric - (j0->>'happy_sessions')::numeric;
  d_amt  := (j1->>'happy_discount')::numeric - (j0->>'happy_discount')::numeric;
  res := pg_temp.chk(res, d_sess = 3, 'the report counts the 3 happy hour sessions and not the full price one');
  res := pg_temp.chk(res, d_amt = 64, 'and the discount given is exactly 64 (18 + 10 + 36)');
  res := pg_temp.chk(res, (j1->>'gaming')::numeric - (j0->>'gaming')::numeric = 72 + 40 + 144 + 50, 'while the gaming sales still add up to what was really charged (306)');

  -- other ranges and readers
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  j1 := sales_report(today - 3, today - 1);
  reset role;
  res := pg_temp.chk(res, (j1->>'happy_discount')::numeric = 0 and (j1->>'happy_sessions')::numeric = 0, 'a range that does not include today shows none of it');

  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  j1 := today_report();
  ok := false; begin perform sales_report(today, today); exception when others then ok := true; end;
  reset role;
  res := pg_temp.chk(res, (j1->>'happy_discount')::numeric - (j0->>'happy_discount')::numeric = 64, 'a staff member sees the same figure in today''s report');
  res := pg_temp.chk(res, ok, 'but a staff member still cannot read a date range');

  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  j1 := dashboard_today();
  reset role;
  res := pg_temp.chk(res, j1->'sales' ? 'happy_discount' and (j1->'sales'->>'happy_discount')::numeric - (j0->>'happy_discount')::numeric = 64, 'the dashboard shows it too');

  -- nobody else can call the internals
  set local role authenticated;
  ok := false; begin perform report_core(today, today); exception when others then ok := true; end;
  res := pg_temp.chk(res, ok, 'the report functions cannot be called directly');
  ok := false; begin perform session_list_charge(v_a); exception when others then ok := true; end;
  reset role;
  res := pg_temp.chk(res, ok, 'neither can the list charge');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
