-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0031: the failed-login counting that locks an account for 15 minutes after 5 wrong passwords.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Every line should start with "ok"; "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  a     text := 'acct:test-lockout-a';
  b     text := 'acct:test-lockout-b';
  i     int;
  n     int;
  bad   int;
begin
  res := pg_temp.chk(res, login_locked(array[a]) = 0, 'a fresh account is not locked');

  for i in 1..4 loop perform login_failed(a, 5, 15); end loop;
  res := pg_temp.chk(res, login_locked(array[a]) = 0, '4 wrong passwords do not lock the account');
  res := pg_temp.chk(res, (select failures from login_attempts where key = a) = 4, 'the 4 failures are counted');

  perform login_failed(a, 5, 15);
  n := login_locked(array[a]);
  res := pg_temp.chk(res, n between 890 and 900, 'the 5th wrong password locks the account for about 15 minutes (' || n || ' seconds left)');
  res := pg_temp.chk(res, login_locked(array[b]) = 0, 'another account is not affected');
  res := pg_temp.chk(res, login_locked(array[b, a]) = n or login_locked(array[b, a]) between n - 1 and n, 'checking several keys at once reports the longest lock');

  -- a correct password clears the count (so the failures must be consecutive)
  perform login_succeeded(a);
  res := pg_temp.chk(res, login_locked(array[a]) = 0 and not exists (select 1 from login_attempts where key = a), 'a correct password clears the lock and the count');

  perform login_failed(b, 5, 15);
  perform login_failed(b, 5, 15);
  perform login_succeeded(b);
  for i in 1..4 loop perform login_failed(b, 5, 15); end loop;
  res := pg_temp.chk(res, login_locked(array[b]) = 0, '2 wrong, 1 right, then 4 wrong is not 5 in a row: no lock');

  -- the lock ends by itself
  perform login_failed(a, 5, 15); perform login_failed(a, 5, 15); perform login_failed(a, 5, 15); perform login_failed(a, 5, 15); perform login_failed(a, 5, 15);
  update login_attempts set locked_until = now() - interval '1 second', window_start = now() - interval '16 minutes' where key = a;
  res := pg_temp.chk(res, login_locked(array[a]) = 0, 'when the 15 minutes are over the account is open again');
  perform login_failed(a, 5, 15);
  res := pg_temp.chk(res, (select failures from login_attempts where key = a) = 1 and login_locked(array[a]) = 0, 'and the old failures do not count: the count starts again at 1');

  -- old failures are forgotten even without a lock
  update login_attempts set failures = 4, window_start = now() - interval '20 minutes', locked_until = null where key = b;
  perform login_failed(b, 5, 15);
  res := pg_temp.chk(res, (select failures from login_attempts where key = b) = 1 and login_locked(array[b]) = 0, 'slow guessing (4 failures, then one 20 minutes later) is not a lock');

  -- the address limit works the same way with its own number
  for i in 1..19 loop perform login_failed('ip:203.0.113.9', 20, 15); end loop;
  res := pg_temp.chk(res, login_locked(array['ip:203.0.113.9']) = 0, '19 failures from one address: not locked yet');
  perform login_failed('ip:203.0.113.9', 20, 15);
  res := pg_temp.chk(res, login_locked(array['ip:203.0.113.9']) > 0, 'the 20th failure from one address locks that address');

  -- bad input is refused
  begin perform login_failed(null, 5, 15); n := 0; exception when others then n := 1; end;
  res := pg_temp.chk(res, n = 1, 'a missing key is refused');
  begin perform login_failed('x', 0, 15); n := 0; exception when others then n := 1; end;
  res := pg_temp.chk(res, n = 1, 'a limit of 0 is refused');

  -- who may use it: only the server side
  res := pg_temp.chk(res, not has_function_privilege('anon', 'public.login_failed(text,int,int)', 'execute') and not has_function_privilege('authenticated', 'public.login_failed(text,int,int)', 'execute'), 'visitors and signed-in users cannot count failures (so they cannot lock someone else out through the app)');
  res := pg_temp.chk(res, not has_function_privilege('anon', 'public.login_locked(text[])', 'execute') and not has_function_privilege('authenticated', 'public.login_locked(text[])', 'execute'), 'visitors and signed-in users cannot ask who is locked');
  res := pg_temp.chk(res, not has_function_privilege('anon', 'public.login_succeeded(text)', 'execute') and not has_function_privilege('authenticated', 'public.login_succeeded(text)', 'execute'), 'visitors and signed-in users cannot clear a lock');
  res := pg_temp.chk(res, has_function_privilege('service_role', 'public.login_failed(text,int,int)', 'execute') and has_function_privilege('service_role', 'public.login_locked(text[])', 'execute') and has_function_privilege('service_role', 'public.login_succeeded(text)', 'execute'), 'the server side (the secure-login function) can use all three');
  res := pg_temp.chk(res, not has_table_privilege('anon', 'public.login_attempts', 'select') and not has_table_privilege('authenticated', 'public.login_attempts', 'select'), 'nobody in the app can read the attempts table');
  res := pg_temp.chk(res, (select relrowsecurity from pg_class where oid = 'public.login_attempts'::regclass), 'the attempts table has row level security on');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
