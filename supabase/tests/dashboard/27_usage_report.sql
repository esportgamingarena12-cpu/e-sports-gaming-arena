-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0028 (usage_report: PC or PS5, and the canteen ranking). It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Every line in the message should start with "ok". A line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res    text[] := '{}';
  v_pc   bigint;
  v_ps   bigint;
  r      jsonb;
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  err    text;
  state  text;
  bad    int;
begin
  insert into auth.users (id, aud, role, email) values
    ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'admin-ur@t.dev'),
    ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'staff-ur@t.dev')
  on conflict do nothing;
  insert into profiles (id, full_name, role, active) values
    ('00000000-0000-0000-0000-0000000000c1', 'Admin UR', 'admin', true),
    ('00000000-0000-0000-0000-0000000000c2', 'Staff UR', 'staff', true)
  on conflict (id) do update set role = excluded.role, active = true;
  insert into stations (name, type, rate_per_hour, sort_order) values ('T27 PC', 'pc', 90, 991), ('T27 PS', 'ps5', 110, 992);
  insert into products (name, category, price, stock_qty, low_stock_level, track_stock) values
    ('T27 Samosa', 'Food', 15, 100, 0, true), ('T27 Cake', 'Food', 40, 100, 0, true), ('T27 Unsold', 'Food', 10, 100, 0, true);
  update settings set billing_block_min = 15, min_bill_min = 30;

  -- staff: a PC session of 60 minutes with 3 samosas, a PS5 session of 30 minutes with a cake and 2 samosas; both billed
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  set local role authenticated;
  v_pc := start_session((select id from stations where name = 'T27 PC'));
  v_ps := start_session((select id from stations where name = 'T27 PS'));
  reset role;
  update sessions set started_at = now() - interval '60 minutes' where id = v_pc;
  update sessions set started_at = now() - interval '30 minutes' where id = v_ps;
  set local role authenticated;
  perform add_tab_item(v_pc, (select id from products where name = 'T27 Samosa'), 3);
  perform add_tab_item(v_ps, (select id from products where name = 'T27 Cake'), 1);
  perform add_tab_item(v_ps, (select id from products where name = 'T27 Samosa'), 2);
  perform checkout_bill(jsonb_build_object('session_id', v_pc, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 135))));
  perform checkout_bill(jsonb_build_object('session_id', v_ps, 'payments', jsonb_build_array(jsonb_build_object('mode', 'cash', 'amount', 125))));
  reset role;

  -- admin reads the report
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  set local role authenticated;
  r := usage_report(today, today);
  reset role;

  res := pg_temp.chk(res, jsonb_typeof(r->'by_type') = 'array' and jsonb_typeof(r->'by_station') = 'array' and jsonb_typeof(r->'canteen') = 'array', 'the report has by_type, by_station and canteen');
  res := pg_temp.chk(res, (select abs((x->>'minutes')::int - 60) <= 1 from jsonb_array_elements(r->'by_station') x where x->>'name' = 'T27 PC'), 'PC station: about 60 minutes played');
  res := pg_temp.chk(res, (select abs((x->>'minutes')::int - 30) <= 1 from jsonb_array_elements(r->'by_station') x where x->>'name' = 'T27 PS'), 'PS5 station: about 30 minutes played');
  res := pg_temp.chk(res, (select (x->>'sessions')::int = 1 from jsonb_array_elements(r->'by_station') x where x->>'name' = 'T27 PC'), 'PC station: 1 session');
  res := pg_temp.chk(res, (select (x->>'revenue')::numeric = 90 from jsonb_array_elements(r->'by_station') x where x->>'name' = 'T27 PC'), 'PC station: gaming revenue 90 (60 min at 90/hr, no canteen)');
  res := pg_temp.chk(res, (select (x->>'revenue')::numeric = 55 from jsonb_array_elements(r->'by_station') x where x->>'name' = 'T27 PS'), 'PS5 station: gaming revenue 55 (30 min at 110/hr)');
  res := pg_temp.chk(res, (select (x->>'minutes')::int >= 59 from jsonb_array_elements(r->'by_type') x where x->>'type' = 'pc'), 'by kind: PC has at least the 60 minutes');
  res := pg_temp.chk(res, (select (x->>'minutes')::int >= 29 from jsonb_array_elements(r->'by_type') x where x->>'type' = 'ps5'), 'by kind: PS5 has at least the 30 minutes');
  res := pg_temp.chk(res, (select count(*) from jsonb_array_elements(r->'by_type') x where x->>'type' in ('pc', 'ps5')) = 2, 'by kind: one line for PC and one for PS5');

  res := pg_temp.chk(res, (select (x->>'qty')::int = 5 from jsonb_array_elements(r->'canteen') x where x->>'name' = 'T27 Samosa'), 'canteen: samosa sold 5 (3 + 2)');
  res := pg_temp.chk(res, (select (x->>'amount')::numeric = 75 from jsonb_array_elements(r->'canteen') x where x->>'name' = 'T27 Samosa'), 'canteen: samosa amount 75');
  res := pg_temp.chk(res, (select (x->>'qty')::int = 1 from jsonb_array_elements(r->'canteen') x where x->>'name' = 'T27 Cake'), 'canteen: cake sold 1');
  res := pg_temp.chk(res, (select (x->>'qty')::int = 0 from jsonb_array_elements(r->'canteen') x where x->>'name' = 'T27 Unsold'), 'canteen: an item that sold nothing is listed with 0');
  res := pg_temp.chk(res, (select (jsonb_path_query_first(r->'canteen', '$[*] ? (@.name == "T27 Samosa")')->>'qty')::int >= (jsonb_path_query_first(r->'canteen', '$[*] ? (@.name == "T27 Cake")')->>'qty')::int), 'canteen: the list has the bigger seller first (samosa before cake)');

  -- a bill that is void is not counted
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  perform void_bill((select min(bill_no) from bills where session_id = v_pc), 'test');
  r := usage_report(today, today);
  reset role;
  res := pg_temp.chk(res, (select (x->>'qty')::int = 2 from jsonb_array_elements(r->'canteen') x where x->>'name' = 'T27 Samosa'), 'after voiding the PC bill, its 3 samosas are no longer counted (2 left)');
  res := pg_temp.chk(res, (select (x->>'revenue')::numeric = 0 from jsonb_array_elements(r->'by_station') x where x->>'name' = 'T27 PC'), 'and its gaming revenue is no longer counted (0)');

  -- an earlier day has none of it
  set local role authenticated;
  r := usage_report(today - 10, today - 5);
  reset role;
  res := pg_temp.chk(res, not exists (select 1 from jsonb_array_elements(r->'by_station') x where x->>'name' like 'T27%' and (x->>'sessions')::int > 0), 'a range before today shows none of these sessions');

  -- limits and permissions
  set local role authenticated;
  begin perform usage_report(today, today - 1); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%valid date range%', 'a backwards range is refused');
  set local role authenticated;
  begin perform usage_report(today - 400, today); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%at most one year%', 'a range longer than a year is refused');

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  set local role authenticated;
  begin perform usage_report(today, today); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'staff cannot read the usage report (admin only)');
  set local role anon;
  begin perform usage_report(today, today); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot read it');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
