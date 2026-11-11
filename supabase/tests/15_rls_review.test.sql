begin;
select * from no_plan();
create function pg_temp.rows_changed(q text) returns int language plpgsql as $f$ declare n int; begin execute q; get diagnostics n = row_count; return n; end $f$;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b5', 'authenticated', 'authenticated', 'staff-rls@t.dev'),
  ('00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', 'cust-rls@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000b5', 'Staff', 'staff', true)
on conflict (id) do update set role = 'staff', active = true;

-- ---------- structure: every table, every role ----------
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity), 0,
          'every public table has row level security on');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
              and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')), 0,
          'visitors (anon) have no privilege on any table');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
              and c.relname in ('bills', 'bill_items', 'payments', 'sessions', 'tab_items', 'stock_moves', 'bookings', 'customers', 'booking_emails', 'mail_config', 'customer_passes')
              and has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')), 0,
          'money, stock, session, booking, customer and pass tables cannot be written directly by anyone signed in');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
              and c.relname in ('booking_emails', 'mail_config') and has_table_privilege('authenticated', c.oid, 'SELECT')), 0,
          'the mail outbox and sender settings cannot be read by anyone signed in');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
              and has_function_privilege('anon', p.oid, 'EXECUTE') and p.proname not in ('booking_info', 'get_availability')), 0,
          'visitors can run only booking_info and get_availability');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')
              and p.proname in ('promote_admin', 'session_charge', 'release_no_shows', 'resolve_customer', 'station_free', 'station_busy_until',
                                'check_booking_window', 'availability_rows', 'report_core', 'run_booking_mail')), 0,
          'internal helper functions cannot be called from the app');

-- ---------- behaviour: a customer ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.rows_changed('update profiles set role = ''admin'' where id = auth.uid()'), 0,
          'a customer cannot promote themselves');
select is(pg_temp.rows_changed('update profiles set active = false where id <> auth.uid()'), 0, 'nor change anyone else''s profile');
select throws_ok($$insert into stations (name, type, rate_per_hour) values ('Hack', 'pc', 1)$$, '42501', null, 'a customer cannot add a station');
select throws_ok($$insert into products (name, price) values ('Free money', 0)$$, '42501', null, 'nor a product');
select is(pg_temp.rows_changed('update settings set shop_name = ''Mine'''), 0, 'nor change shop settings');
select is((select count(*)::int from stations), 0, 'a customer sees no stations');
select is((select count(*)::int from products), 0, 'no products');
select is((select count(*)::int from settings), 0, 'no shop settings');
select is((select count(*)::int from profiles where id <> auth.uid()), 0, 'and only their own profile');
select throws_ok($$select dashboard_today()$$, '42501', null, 'a customer cannot open the dashboard');
select throws_ok($$select stock_move(1, 5, 'purchase')$$, '42501', null, 'nor change stock');
select throws_ok($$select checkout_bill('{}'::jsonb)$$, '42501', null, 'nor take payment');
select throws_ok($$select void_bill(1, 'x')$$, '42501', null, 'nor void a bill');
reset role;

-- ---------- behaviour: staff ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into stations (name, type, rate_per_hour) values ('Hack', 'pc', 1)$$, '42501', null, 'staff cannot add a station');
select throws_ok($$insert into products (name, price) values ('Free money', 0)$$, '42501', null, 'nor a product');
select is(pg_temp.rows_changed('update products set price = 1'), 0, 'nor change a price');
select is(pg_temp.rows_changed('update settings set shop_name = ''Mine'''), 0, 'nor shop settings');
select is(pg_temp.rows_changed('update profiles set role = ''admin'' where id = auth.uid()'), 0, 'staff cannot promote themselves');
select throws_ok($$select void_bill(1, 'x')$$, '42501', null, 'staff cannot void a bill');
select throws_ok($$select sales_report(current_date, current_date)$$, '42501', null, 'staff cannot read range reports');
select ok((select count(*) from stations) > 0, 'staff do see stations');
reset role;

-- ---------- behaviour: visitors ----------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from stations$$, '42501', null, 'a visitor cannot read stations');
select throws_ok($$select * from bookings$$, '42501', null, 'nor bookings');
select throws_ok($$select * from customers$$, '42501', null, 'nor customers');
select throws_ok($$select * from profiles$$, '42501', null, 'nor profiles');
select throws_ok($$select create_booking('pc', now() + interval '1 day', 1)$$, '42501', null, 'nor book without signing in');
reset role;

-- ---------- passes (Phase 12) ----------
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
              and p.proname in ('session_pass_usage', 'bill_item_pass_label', 'booking_email_queue')), 0,
          'trigger functions cannot be called from the app');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into pass_types (name, price, validity_days, kind) values ('Free', 0, 1, 'unlimited')$$, '42501', null, 'a customer cannot add a pass type');
select is((select count(*)::int from pass_types), 0, 'a customer sees no pass price list');
select throws_ok($$select sell_pass(1, 'x', '9999999999', null, '[]'::jsonb)$$, '42501', null, 'a customer cannot sell a pass');
select throws_ok($$select cancel_pass(1, 'x')$$, '42501', null, 'nor cancel one');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into pass_types (name, price, validity_days, kind) values ('Free', 0, 1, 'unlimited')$$, '42501', null, 'staff cannot add a pass type');
select throws_ok($$select cancel_pass(1, 'x')$$, '42501', null, 'staff cannot cancel a pass');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from customer_passes$$, '42501', null, 'a visitor cannot read passes');
select throws_ok($$select my_passes()$$, '42501', null, 'nor ask for passes');
reset role;

select * from finish();
rollback;
