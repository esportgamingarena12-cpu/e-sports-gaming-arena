-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0023 (overtime grace). It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Every line in the message should start with "ok". A line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  v_s   bigint;
  v_t   timestamptz;
  v_blk int;
  err   text;
  state text;
  bad   int;
begin
  insert into auth.users (id, aud, role, email) values
    ('00000000-0000-0000-0000-0000000000ad', 'authenticated', 'authenticated', 'staff-ot@t.dev'),
    ('00000000-0000-0000-0000-0000000000ae', 'authenticated', 'authenticated', 'cust-ot@t.dev')
  on conflict do nothing;
  insert into profiles (id, full_name, role, active) values
    ('00000000-0000-0000-0000-0000000000ad', 'Staff', 'staff', true),
    ('00000000-0000-0000-0000-0000000000ae', 'Cust', 'customer', true)
  on conflict (id) do update set role = excluded.role, active = true;
  insert into stations (name, type, rate_per_hour, sort_order) values ('T24 PC', 'pc', 90, 961), ('T24 PC2', 'pc', 90, 962);
  insert into packages (name, minutes, price, station_type, active) values ('T24 P30', 30, 50, 'pc', true);

  -- the example only holds with 15 minute blocks, so make that so for this test (rolled back)
  update settings set billing_block_min = 15, overtime_grace_min = 10;
  select billing_block_min into v_blk from settings;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  set local role authenticated;
  v_s := start_session((select id from stations where name = 'T24 PC'), (select id from packages where name = 'T24 P30'));
  reset role;
  select started_at into v_t from sessions where id = v_s;

  res := pg_temp.chk(res, (select overtime_grace_min from sessions where id = v_s) = 10, 'a new session remembers the grace from Settings (10)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '25 minutes') = 50, '25 min: the package price (50)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '30 minutes') = 50, '30 min: the package price (50)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '35 minutes') = 50, '5 min over: free inside the grace (50)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '40 minutes') = 50, 'exactly 10 min over: still free (50)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '41 minutes') = 72.5, '11 min over: one 15 minute block (50 + 22.50 = 72.50)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '45 minutes') = 72.5, '15 min over: still one block (72.50)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '46 minutes') = 95, '16 min over: two blocks, 30 minutes (50 + 45 = 95)');
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '31 minutes 43 seconds') = 50, '31 min 43 s (the counter example): 50');

  -- staff's choice
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  set local role authenticated;
  perform set_overtime_mode(v_s, 'charge');
  reset role;
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '35 minutes') = 72.5, "'charge': 5 min over is charged (72.50)");
  set local role authenticated;
  perform set_overtime_mode(v_s, 'waive');
  reset role;
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '90 minutes') = 50, "'waive': 60 min over is not charged (50)");
  set local role authenticated;
  perform set_overtime_mode(v_s, null);
  reset role;
  res := pg_temp.chk(res, session_charge(v_s, v_t + interval '41 minutes') = 72.5, 'back to automatic: 11 min over is charged again');

  set local role authenticated;
  begin perform set_overtime_mode(v_s, 'maybe'); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%Choose charge%', 'a made-up choice is refused');

  -- a per-hour session has no overtime
  set local role authenticated;
  begin perform set_overtime_mode(start_session((select id from stations where name = 'T24 PC2')), 'charge'); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%package sessions only%', 'a per-hour session cannot be given an overtime choice');

  -- a change of the setting reaches only sessions that start afterwards
  update settings set overtime_grace_min = 5;
  res := pg_temp.chk(res, (select overtime_grace_min from sessions where id = v_s) = 10, 'changing Settings does not change a running session');

  -- who may call it
  set local role anon;
  begin perform set_overtime_mode(v_s, 'charge'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot set it');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ae","role":"authenticated"}', true);
  set local role authenticated;
  begin perform set_overtime_mode(v_s, 'charge'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a customer cannot set it');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
