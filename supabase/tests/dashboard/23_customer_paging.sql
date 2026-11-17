-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0022 (customer_list limit and offset). It needs no extra extension.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so nothing it creates stays.
-- Read the lines in the message: every line should start with "ok". Any line that starts with "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res   text[] := '{}';
  a     bigint[];
  b     bigint[];
  c     bigint[];
  whole bigint[];
  n     int;
  state text;
  bad   int;
begin
  insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000ac', 'authenticated', 'authenticated', 'staff-pg@t.dev')
  on conflict do nothing;
  insert into profiles (id, full_name, role, active) values ('00000000-0000-0000-0000-0000000000ac', 'Staff', 'staff', true)
  on conflict (id) do update set role = excluded.role, active = true;
  insert into customers (name, phone) select 'T23 Customer ' || lpad(g::text, 2, '0'), '9230000' || lpad(g::text, 3, '0') from generate_series(1, 12) g;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from customer_list('T23');
  res := pg_temp.chk(res, n = 12, 'with no limit given, everything that matches comes back (old behaviour): ' || n);
  select count(*) into n from customer_list('T23', 5, 0);
  res := pg_temp.chk(res, n = 5, 'the first page has the limit (5): ' || n);
  select count(*) into n from customer_list('T23', 5, 10);
  res := pg_temp.chk(res, n = 2, 'the last page is short (2): ' || n);
  select count(*) into n from customer_list('T23', 5, 20);
  res := pg_temp.chk(res, n = 0, 'past the end is empty: ' || n);

  select array_agg(id order by id) into a from customer_list('T23', 5, 0);
  select array_agg(id order by id) into b from customer_list('T23', 5, 5);
  select array_agg(id order by id) into c from customer_list('T23', 5, 10);
  select array_agg(id order by id) into whole from customer_list('T23');
  res := pg_temp.chk(res, (a || b || c) = whole, 'the three pages together are the whole list');
  select count(distinct id) into n from (select id from customer_list('T23', 5, 0) union all select id from customer_list('T23', 5, 5) union all select id from customer_list('T23', 5, 10)) x;
  res := pg_temp.chk(res, n = 12, 'no customer appears on two pages (12 different): ' || n);
  res := pg_temp.chk(res, (select name from customer_list('T23', 1, 0)) = 'T23 Customer 01', 'the order is stable: first is T23 Customer 01');
  select count(*) into n from customer_list('T23', 0, 0);
  res := pg_temp.chk(res, n = 1, 'a limit below 1 is treated as 1: ' || n);
  select count(*) into n from customer_list('T23', 100000, 0);
  res := pg_temp.chk(res, n <= 500, 'the limit is capped at 500: ' || n);
  select count(*) into n from customer_list('T23', 5, -3);
  res := pg_temp.chk(res, n = 5, 'a negative offset is treated as 0: ' || n);
  reset role;

  set local role anon;
  begin perform * from customer_list('T23', 5, 0); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot list customers');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
