-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0027 (undo_stop_session). It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Every line in the message should start with "ok". A line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  v_a   bigint;
  v_b   bigint;
  v_t   timestamptz;
  err   text;
  state text;
  bad   int;
begin
  insert into auth.users (id, aud, role, email) values
    ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'staff-us@t.dev'),
    ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'cust-us@t.dev')
  on conflict do nothing;
  insert into profiles (id, full_name, role, active) values
    ('00000000-0000-0000-0000-0000000000b1', 'Staff US', 'staff', true),
    ('00000000-0000-0000-0000-0000000000b2', 'Cust', 'customer', true)
  on conflict (id) do update set role = excluded.role, active = true;
  insert into stations (name, type, rate_per_hour, sort_order) values ('T26 PC A', 'pc', 90, 981), ('T26 PC B', 'pc', 90, 982);
  update settings set billing_block_min = 15, min_bill_min = 30;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  set local role authenticated;
  v_a := start_session((select id from stations where name = 'T26 PC A'));
  v_b := start_session((select id from stations where name = 'T26 PC B'));
  reset role;
  update sessions set started_at = now() - interval '40 minutes' where id in (v_a, v_b);
  select started_at into v_t from sessions where id = v_a;

  -- stopping one session leaves the other running
  set local role authenticated;
  perform end_session(v_a);
  reset role;
  res := pg_temp.chk(res, (select status::text from sessions where id = v_a) = 'ended', 'session A is stopped');
  res := pg_temp.chk(res, (select status::text from sessions where id = v_b) = 'running' and (select ended_at from sessions where id = v_b) is null, 'session B is still running with no end time');

  -- the Stop was a mistake: resume A
  update sessions set ended_at = now() - interval '10 minutes' where id = v_a;  -- pretend it was stopped 10 minutes ago
  set local role authenticated;
  perform undo_stop_session(v_a);
  reset role;
  res := pg_temp.chk(res, (select status::text from sessions where id = v_a) = 'running' and (select ended_at from sessions where id = v_a) is null, 'A runs again, with no end time');
  res := pg_temp.chk(res, (select paused_seconds from sessions where id = v_a) = 0, 'the 10 minutes since the Stop are not taken off (they count as played)');
  res := pg_temp.chk(res, session_charge(v_a, v_t + interval '60 minutes') = 90, 'it is billed as one continuous session: 60 minutes = 90');
  res := pg_temp.chk(res, (select status::text from sessions where id = v_b) = 'running', 'session B was not touched');
  res := pg_temp.chk(res, (select count(*) from session_end_log where session_id = v_a and reason like 'Stop undone%') = 1, 'the audit log has a "Stop undone" line');
  res := pg_temp.chk(res, (select count(*) from session_end_log where session_id = v_b) = 0, 'and nothing was logged for B');

  -- only a stopped, unbilled session can be resumed
  set local role authenticated;
  begin perform undo_stop_session(v_a); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%stopped session that has not been billed%', 'a running session cannot be "resumed"');
  update sessions set status = 'billed' where id = v_b;
  set local role authenticated;
  begin perform undo_stop_session(v_b); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%stopped session that has not been billed%', 'a billed session cannot be resumed');

  -- who may call it
  set local role anon;
  begin perform undo_stop_session(v_a); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot resume a session');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  set local role authenticated;
  begin perform undo_stop_session(v_a); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a customer cannot resume a session');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
