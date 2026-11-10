begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-m@t.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'staff-m@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

insert into stations (name, type, rate_per_hour) values ('T-PC', 'pc', 60);
insert into packages (name, minutes, price, station_type) values ('T-Pack', 60, 80, 'pc');

-- staff: reads fine, every direct write is rejected ------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select ok((select count(*) from stations) >= 1, 'staff can read stations');
select ok((select count(*) from packages) >= 1, 'staff can read packages');
update stations set rate_per_hour = 1 where name = 'T-PC';
update packages set price = 1 where name = 'T-Pack';
delete from stations where name = 'T-PC';
delete from packages where name = 'T-Pack';
select throws_ok($$insert into stations (name, type, rate_per_hour) values ('T-Hack', 'pc', 1)$$,
                 '42501', null, 'staff cannot insert a station');
select throws_ok($$insert into packages (name, minutes, price, station_type) values ('T-Hack', 1, 1, 'pc')$$,
                 '42501', null, 'staff cannot insert a package');
select throws_ok($$insert into products (name, price) values ('T-Hack', 1)$$,
                 '42501', null, 'staff cannot insert a product');
reset role;
select is((select rate_per_hour from stations where name = 'T-PC'), 60.00::numeric, 'staff cannot change a station rate');
select is((select price from packages where name = 'T-Pack'), 80.00::numeric, 'staff cannot change a package price');
select ok(exists (select 1 from stations where name = 'T-PC'), 'staff cannot delete a station');
select ok(exists (select 1 from packages where name = 'T-Pack'), 'staff cannot delete a package');

-- admin can insert, update ------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into stations (name, type, rate_per_hour) values ('T-Admin', 'ps5', 90);
insert into packages (name, minutes, price, station_type) values ('T-AdminPack', 30, 40, 'ps5');
insert into products (name, price) values ('T-AdminProd', 10);
update stations set rate_per_hour = 70 where name = 'T-PC';
reset role;
select ok(exists (select 1 from stations where name = 'T-Admin'), 'admin can add a station');
select ok(exists (select 1 from packages where name = 'T-AdminPack'), 'admin can add a package');
select ok(exists (select 1 from products where name = 'T-AdminProd'), 'admin can add a product');
select is((select stock_qty from products where name = 'T-AdminProd'), 0, 'a new product starts with zero stock');
select is((select rate_per_hour from stations where name = 'T-PC'), 70.00::numeric, 'admin can change a station rate');

select * from finish();
rollback;
