-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0029 and the sign-up rules: nobody can become admin by signing up or by editing their own profile,
-- and passwords / password hashes cannot be read by the app's roles. It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Every line in the message should start with "ok". A line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  r     text;
  n     int;
  state text;
  bad   int;
begin
  -- one admin, one staff member, and a brand-new sign-up that TRIES to claim the admin role in its sign-up data
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'admin-sr@t.dev', '{}'),
    ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'staff-sr@t.dev', '{}'),
    ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'sneaky-sr@t.dev',
      '{"full_name":"Sneaky","role":"admin","user_role":"admin"}'),
    ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'other-sr@t.dev', '{}')
  on conflict do nothing;
  update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';
  update profiles set role = 'staff' where id = '00000000-0000-0000-0000-0000000000d2';

  select role::text into r from profiles where id = '00000000-0000-0000-0000-0000000000d3';
  res := pg_temp.chk(res, r = 'customer', 'a sign-up that asks for the admin role in its data still becomes a customer (got ' || coalesce(r, 'nothing') || ')');
  select role::text into r from profiles where id = '00000000-0000-0000-0000-0000000000d4';
  res := pg_temp.chk(res, r = 'customer', 'a normal sign-up becomes a customer');

  -- the customer tries to make themselves admin (as the app would: signed in, role authenticated)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
  set local role authenticated;
  begin update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d3'; exception when others then null; end;
  reset role;
  select role::text into r from profiles where id = '00000000-0000-0000-0000-0000000000d3';
  res := pg_temp.chk(res, r = 'customer', 'a customer cannot make themselves admin through the app');

  -- the same attempt with row level security out of the way: the new trigger must still refuse it
  begin update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d3'; state := null; exception when others then state := sqlstate; end;
  res := pg_temp.chk(res, state = '42501', 'the trigger itself refuses a customer changing their role (even without row level security)');
  begin update profiles set active = false where id = '00000000-0000-0000-0000-0000000000d2'; state := null; exception when others then state := sqlstate; end;
  res := pg_temp.chk(res, state = '42501', 'the trigger refuses a customer suspending someone');

  -- the staff member cannot promote themselves, with or without row level security
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
  begin update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d2'; state := null; exception when others then state := sqlstate; end;
  res := pg_temp.chk(res, state = '42501', 'the trigger refuses staff promoting themselves to admin');
  set local role authenticated;
  begin update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d2'; exception when others then null; end;
  reset role;
  select role::text into r from profiles where id = '00000000-0000-0000-0000-0000000000d2';
  res := pg_temp.chk(res, r = 'staff', 'staff cannot make themselves admin through the app');

  -- who may call the promote function
  set local role authenticated;
  begin perform promote_admin('sneaky-sr@t.dev'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a signed-in user cannot call promote_admin');
  set local role anon;
  begin perform promote_admin('sneaky-sr@t.dev'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot call promote_admin');

  -- an admin can still change a role and suspend someone (the Staff screen keeps working)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
  set local role authenticated;
  update profiles set role = 'staff' where id = '00000000-0000-0000-0000-0000000000d4';
  update profiles set active = false where id = '00000000-0000-0000-0000-0000000000d4';
  reset role;
  select role::text into r from profiles where id = '00000000-0000-0000-0000-0000000000d4';
  res := pg_temp.chk(res, r = 'staff' and not (select active from profiles where id = '00000000-0000-0000-0000-0000000000d4'), 'an admin can still change a role and suspend a person');

  -- with no one signed in (the admin-create-staff function uses the service key) a role can still be set
  perform set_config('request.jwt.claims', '', true);
  update profiles set role = 'customer', active = true where id = '00000000-0000-0000-0000-0000000000d4';
  select role::text into r from profiles where id = '00000000-0000-0000-0000-0000000000d4';
  res := pg_temp.chk(res, r = 'customer', 'the server side (service key / SQL editor) can still set a role');

  -- a customer sees only their own profile, and cannot read passwords or password hashes
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from profiles;
  reset role;
  res := pg_temp.chk(res, n = 1, 'a customer sees only their own profile (saw ' || n || ')');
  set local role authenticated;
  begin perform 1 from auth.users limit 1; state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a signed-in user cannot read the auth users table (where password hashes live)');
  set local role anon;
  begin perform 1 from auth.users limit 1; state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot read the auth users table');
  res := pg_temp.chk(res, not exists (select 1 from information_schema.columns where table_schema = 'public' and column_name ~* 'password|passwd|hash|secret|token|api_?key' and table_name not in ('mail_config')), 'no table in the app has a password, hash, secret or token column (except the mail secret table)');
  res := pg_temp.chk(res, not has_table_privilege('authenticated', 'public.mail_config', 'select') and not has_table_privilege('anon', 'public.mail_config', 'select'), 'the mail secret table cannot be read by the app or visitors');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
