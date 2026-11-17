-- 22_extend_session.test.sql : migration 0021 (extend_session). Everything is rolled back at the end.
begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'staff-ex@t.dev'),
  ('00000000-0000-0000-0000-0000000000ab', 'authenticated', 'authenticated', 'cust-ex@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000aa', 'Staff', 'staff', true),
  ('00000000-0000-0000-0000-0000000000ab', 'Cust', 'customer', true)
on conflict (id) do update set role = excluded.role, active = true;

insert into stations (name, type, rate_per_hour, sort_order) values
  ('T22 PC A', 'pc', 60, 951), ('T22 PC B', 'pc', 60, 952), ('T22 PC C', 'pc', 60, 953), ('T22 PS A', 'ps5', 110, 954);
insert into packages (name, minutes, price, station_type, active) values
  ('T22 P30', 30, 50, 'pc', true), ('T22 P60', 60, 90, 'pc', true), ('T22 Old', 30, 40, 'pc', false), ('T22 PS30', 30, 60, 'ps5', true);

create temp table ses (k text, id bigint);
grant all on ses to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ses select 'pkg', start_session((select id from stations where name = 'T22 PC A'), (select id from packages where name = 'T22 P30'));
insert into ses select 'hr',  start_session((select id from stations where name = 'T22 PC B'));
insert into ses select 'end', start_session((select id from stations where name = 'T22 PC C'), (select id from packages where name = 'T22 P30'));

-- ---------- a package session is extended by adding a package ----------
select lives_ok($$select extend_session((select id from ses where k = 'pkg'), (select id from packages where name = 'T22 P60'))$$, 'a package session can be extended with another package');
select is((select package_minutes from sessions where id = (select id from ses where k = 'pkg')), 90, 'the minutes are added (30 + 60)');
select is((select package_price from sessions where id = (select id from ses where k = 'pkg')), 140.00::numeric, 'the prices are added (50 + 90)');
select is((select package_name from sessions where id = (select id from ses where k = 'pkg')), 'T22 P30 + T22 P60', 'the name shows both packages');
select is(session_charge((select id from ses where k = 'pkg'), (select started_at + interval '80 minutes' from sessions where id = (select id from ses where k = 'pkg'))), 140.00::numeric, 'inside the combined time the bill is the combined price');
select ok(session_charge((select id from ses where k = 'pkg'), (select started_at + interval '100 minutes' from sessions where id = (select id from ses where k = 'pkg'))) > 140, 'beyond the combined time the bill adds overtime');
select lives_ok($$select extend_session((select id from ses where k = 'pkg'), (select id from packages where name = 'T22 P30'))$$, 'and extended again');
select is((select package_price from sessions where id = (select id from ses where k = 'pkg')), 190.00::numeric, 'a second extension adds again (140 + 50)');

select throws_like($$select extend_session((select id from ses where k = 'pkg'), (select id from packages where name = 'T22 PS30'))$$, '%not for this station type%', 'a package for another station type is refused');
select throws_like($$select extend_session((select id from ses where k = 'pkg'), (select id from packages where name = 'T22 Old'))$$, '%not found or inactive%', 'an inactive package is refused');
select throws_like($$select extend_session((select id from ses where k = 'pkg'))$$, '%Choose the package%', 'a package session needs a package');

-- ---------- a per-hour session keeps per-hour billing; the reminder moves ----------
select lives_ok($$select extend_session((select id from ses where k = 'hr'), null, 30)$$, 'a per-hour session can be extended by minutes');
select is((select alarm_minutes from sessions where id = (select id from ses where k = 'hr')), 30, 'with no timer, one is set 30 minutes from now');
select lives_ok($$select extend_session((select id from ses where k = 'hr'), null, 30)$$, 'extended again');
select is((select alarm_minutes + alarm_extra_minutes from sessions where id = (select id from ses where k = 'hr')), 60, 'the reminder is now 60 minutes from the start');
select is((select package_minutes from sessions where id = (select id from ses where k = 'hr')), null, 'billing stays per hour (no package added)');
select throws_like($$select extend_session((select id from ses where k = 'hr'), null, 0)$$, '%1 to 600%', 'zero minutes is refused');
select throws_like($$select extend_session((select id from ses where k = 'hr'), null, 601)$$, '%1 to 600%', 'more than 600 minutes is refused');

-- ---------- a stopped (not billed) session comes back to running ----------
select end_session((select id from ses where k = 'end'));
select is((select status::text from sessions where id = (select id from ses where k = 'end')), 'ended', 'the session was stopped');
select lives_ok($$select extend_session((select id from ses where k = 'end'), (select id from packages where name = 'T22 P60'))$$, 'extending a stopped session works');
select is((select status::text from sessions where id = (select id from ses where k = 'end')), 'running', 'it is running again');
select ok((select ended_at is null from sessions where id = (select id from ses where k = 'end')), 'with no end time');
select is((select package_minutes from sessions where id = (select id from ses where k = 'end')), 90, 'and the package time was added');
reset role;

-- ---------- who may call it ----------
set local role anon;
select throws_ok($$select extend_session(1, 1)$$, '42501', null, 'a visitor cannot extend a session');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select extend_session((select id from ses where k = 'hr'), null, 30)$$, '42501', null, 'a customer cannot extend a session');
reset role;

select * from finish();
rollback;
