begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-st@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

select ok(abs(extract(epoch from (server_now() - clock_timestamp()))) < 5, 'server_now is the database clock');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select ok(server_now() is not null, 'a signed-in user can read the server time');
reset role;

set local role anon;
select throws_ok($$select server_now()$$, '42501', null, 'anonymous visitors cannot call server_now');
reset role;

select * from finish();
rollback;
