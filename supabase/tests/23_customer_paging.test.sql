-- 23_customer_paging.test.sql : migration 0022 (customer_list limit and offset). Rolled back at the end.
begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000ac', 'authenticated', 'authenticated', 'staff-pg@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values ('00000000-0000-0000-0000-0000000000ac', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;
insert into customers (name, phone) select 'T23 Customer ' || lpad(g::text, 2, '0'), '9230000' || lpad(g::text, 3, '0') from generate_series(1, 12) g;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from customer_list('T23')), 12, 'with no limit given, everything that matches comes back (old behaviour)');
select is((select count(*)::int from customer_list('T23', 5, 0)), 5, 'the first page has the limit');
select is((select count(*)::int from customer_list('T23', 5, 10)), 2, 'the last page is short');
select is((select count(*)::int from customer_list('T23', 5, 20)), 0, 'past the end is empty');
select is((select array_agg(id order by id) from customer_list('T23', 5, 0)) || (select array_agg(id order by id) from customer_list('T23', 5, 5)) || (select array_agg(id order by id) from customer_list('T23', 5, 10)),
          (select array_agg(id order by id) from customer_list('T23')), 'the pages together are the whole list, with no repeats or gaps');
select is((select count(distinct id)::int from (select * from customer_list('T23', 5, 0) union all select * from customer_list('T23', 5, 5) union all select * from customer_list('T23', 5, 10)) x), 12, 'no customer appears on two pages');
select is((select name from customer_list('T23', 1, 0)), 'T23 Customer 01', 'the order is stable (same last-booking, then name)');
select is((select count(*)::int from customer_list('T23', 0, 0)), 1, 'a limit below 1 is treated as 1');
select ok((select count(*) from customer_list('T23', 100000, 0)) <= 500, 'the limit is capped at 500');
select is((select count(*)::int from customer_list('T23', 5, -3)), 5, 'a negative offset is treated as 0');
reset role;

set local role anon;
select throws_ok($$select * from customer_list('T23', 5, 0)$$, '42501', null, 'a visitor cannot list customers');
reset role;

select * from finish();
rollback;
