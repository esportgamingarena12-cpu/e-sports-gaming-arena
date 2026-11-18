-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0026 (set_session_end_time and the audit log). It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Every line in the message should start with "ok". A line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  v_s   bigint;
  v_t   timestamptz;
  err   text;
  state text;
  bad   int;
begin
  insert into auth.users (id, aud, role, email) values
    ('00000000-0000-0000-0000-0000000000af', 'authenticated', 'authenticated', 'staff-et@t.dev'),
    ('00000000-0000-0000-0000-0000000000b0', 'authenticated', 'authenticated', 'cust-et@t.dev')
  on conflict do nothing;
  insert into profiles (id, full_name, role, active) values
    ('00000000-0000-0000-0000-0000000000af', 'Staff ET', 'staff', true),
    ('00000000-0000-0000-0000-0000000000b0', 'Cust', 'customer', true)
  on conflict (id) do update set role = excluded.role, active = true;
  insert into stations (name, type, rate_per_hour, sort_order) values ('T25 PC', 'pc', 90, 971);
  update settings set billing_block_min = 15, min_bill_min = 30;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000af","role":"authenticated"}', true);
  set local role authenticated;
  v_s := start_session((select id from stations where name = 'T25 PC'));
  reset role;
  -- pretend the session started 3 hours ago and is still running (nobody pressed Stop)
  update sessions set started_at = now() - interval '3 hours' where id = v_s;
  select started_at into v_t from sessions where id = v_s;
  res := pg_temp.chk(res, session_charge(v_s) = 270, 'before the correction: 3 hours at 90/hr = 270');

  -- the customer actually left after 50 minutes
  set local role authenticated;
  perform set_session_end_time(v_s, v_t + interval '50 minutes', 'left after 50 minutes, nobody stopped it');
  reset role;
  res := pg_temp.chk(res, (select status::text from sessions where id = v_s) = 'ended', 'the session is now stopped');
  res := pg_temp.chk(res, (select ended_at from sessions where id = v_s) = v_t + interval '50 minutes', 'with the end time that was chosen');
  res := pg_temp.chk(res, session_charge(v_s, (select ended_at from sessions where id = v_s)) = 90, 'the bill counts 50 minutes: 60 minutes billed = 90');
  res := pg_temp.chk(res, (select count(*) from session_end_log where session_id = v_s) = 1, 'one line was written to the audit log');
  res := pg_temp.chk(res, (select to_end = v_t + interval '50 minutes' and reason like 'left after 50%' and changed_by = '00000000-0000-0000-0000-0000000000af' and abs(extract(epoch from (from_end - now()))) < 5 from session_end_log where session_id = v_s), 'the log has who, the reason, the new end, and the time it would have ended (now)');

  -- correcting a stopped (not billed) session again keeps both lines
  set local role authenticated;
  perform set_session_end_time(v_s, v_t + interval '40 minutes', 'checked the camera: left at 40 minutes');
  reset role;
  res := pg_temp.chk(res, (select count(*) from session_end_log where session_id = v_s) = 2, 'a second correction adds a second log line');
  res := pg_temp.chk(res, (select from_end from session_end_log where session_id = v_s order by id desc limit 1) = v_t + interval '50 minutes', 'its "from" is the earlier end time');

  -- limits
  set local role authenticated;
  begin perform set_session_end_time(v_s, now() + interval '1 hour', 'future'); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%future%', 'an end time in the future is refused');
  set local role authenticated;
  begin perform set_session_end_time(v_s, v_t - interval '1 minute', 'before the start'); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%after the session started%', 'an end time before the start is refused');
  set local role authenticated;
  begin perform set_session_end_time(v_s, v_t + interval '30 minutes', '  '); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%reason%', 'a blank reason is refused');
  res := pg_temp.chk(res, (select count(*) from session_end_log where session_id = v_s) = 2, 'refused attempts leave no log line');

  -- a billed session cannot be changed
  update sessions set status = 'billed' where id = v_s;
  set local role authenticated;
  begin perform set_session_end_time(v_s, v_t + interval '30 minutes', 'too late'); err := null; exception when others then err := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, err like '%already billed or cancelled%', 'a billed session cannot be changed');

  -- the log cannot be edited from the app
  set local role authenticated;
  begin delete from session_end_log; err := null; state := null; exception when others then err := sqlerrm; state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'staff cannot delete from the audit log');
  set local role authenticated;
  begin update session_end_log set reason = 'changed'; err := null; state := null; exception when others then err := sqlerrm; state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'staff cannot edit the audit log');

  -- who may call it
  set local role anon;
  begin perform set_session_end_time(v_s, v_t + interval '30 minutes', 'visitor'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot set an end time');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  set local role authenticated;
  begin perform set_session_end_time(v_s, v_t + interval '30 minutes', 'customer'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a customer cannot set an end time');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
