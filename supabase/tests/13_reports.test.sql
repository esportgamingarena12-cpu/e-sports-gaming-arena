begin;
select * from no_plan();

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-rp@t.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'staff-rp@t.dev'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'cust-rp@t.dev')
on conflict do nothing;
insert into profiles (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b3', 'Staff', 'staff', true)
on conflict (id) do update set role = excluded.role, active = true;

-- products: one low on stock
update products set stock_qty = 1, low_stock_level = 5, track_stock = true, active = true
 where id = (select min(id) from products);

-- a running session on PC 1 and a finished one on PC 2
insert into sessions (station_id, customer_name, rate_per_hour, block_min, min_bill_min, started_at, status)
select id, 'Live', 60, 15, 30, now() - interval '10 minutes', 'running' from stations where name = 'PC 1';
insert into sessions (station_id, customer_name, rate_per_hour, block_min, min_bill_min, started_at, ended_at, status)
select id, 'Done', 60, 15, 30, now() - interval '2 hours', now() - interval '1 hour', 'billed' from stations where name = 'PC 2';

-- today: two paid bills (one linked to the finished session, one walk-in) and one void
insert into bills (session_id, customer_name, gaming_charge, canteen_total, subtotal, discount, total, status)
select s.id, 'Done', 100, 50, 150, 10, 140, 'paid' from sessions s where s.customer_name = 'Done';
insert into bills (customer_name, gaming_charge, canteen_total, subtotal, discount, total, status)
values ('Walk', 0, 60, 60, 0, 60, 'paid');
insert into bills (customer_name, gaming_charge, canteen_total, subtotal, discount, total, status, void_reason)
values ('Voided', 500, 0, 500, 0, 500, 'void', 'test');
-- yesterday: one paid bill
insert into bills (customer_name, gaming_charge, canteen_total, subtotal, discount, total, status, created_at)
values ('Old', 80, 0, 80, 0, 80, 'paid',
        ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata') - interval '1 hour');

insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
select bill_no, 'gaming', 'Gaming - PC 2', 1, 100, 100 from bills where customer_name = 'Done';
insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
select bill_no, 'item', 'Cola', 2, 25, 50 from bills where customer_name = 'Done';
insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
select bill_no, 'item', 'Chips', 3, 20, 60 from bills where customer_name = 'Walk';
insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
select bill_no, 'item', 'Cola', 9, 25, 225 from bills where customer_name = 'Voided';
insert into payments (bill_no, mode, amount)
select bill_no, 'cash', 100 from bills where customer_name = 'Done';
insert into payments (bill_no, mode, amount)
select bill_no, 'upi', 40 from bills where customer_name = 'Done';
insert into payments (bill_no, mode, amount)
select bill_no, 'card', 60 from bills where customer_name = 'Walk';
insert into payments (bill_no, mode, amount)
select bill_no, 'cash', 500 from bills where customer_name = 'Voided';

-- bookings today: one no-show, one cancelled
insert into customers (name, phone) values ('Rp Cust', '9555555555');
insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel)
select (select id from customers where name = 'Rp Cust'), 'pc', st.id,
       ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata') + interval '10 hours',
       ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata') + interval '11 hours', 2, s, 'counter'
  from stations st, (values ('no_show'::booking_status), ('cancelled'::booking_status)) v(s) where st.name = 'PC 3';

create temp table d (j jsonb);
grant all on d to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into d select dashboard_today();

select is((select (j -> 'sales' ->> 'net_sales')::numeric from d), 200::numeric, 'today''s sales are the two paid bills');
select is((select (j -> 'sales' ->> 'net_sales')::numeric from d),
          (select coalesce(sum(total), 0) from bills where status = 'paid'
              and created_at >= ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata')),
          'and equal the sum of today''s paid bills');
select is((select (j -> 'sales' ->> 'gaming')::numeric from d), 100::numeric, 'gaming part');
select is((select (j -> 'sales' ->> 'canteen')::numeric from d), 110::numeric, 'canteen part');
select is((select (j -> 'sales' ->> 'discounts')::numeric from d), 10::numeric, 'discounts');
select is((select (j -> 'sales' ->> 'bills')::int from d), 2, 'paid bill count');
select is((select (j -> 'sales' ->> 'void_count')::int from d), 1, 'the void bill is counted as a void');
select is((select (j -> 'sales' ->> 'void_value')::numeric from d), 500::numeric, 'with its value');
select is((select (j -> 'sales' -> 'payments' ->> 'cash')::numeric from d), 100::numeric, 'cash (the void bill''s payment is left out)');
select is((select (j -> 'sales' -> 'payments' ->> 'upi')::numeric from d), 40::numeric, 'UPI');
select is((select (j -> 'sales' -> 'payments' ->> 'card')::numeric from d), 60::numeric, 'card');
select is((select (j -> 'sales' -> 'payments' ->> 'cash')::numeric + (j -> 'sales' -> 'payments' ->> 'upi')::numeric
                 + (j -> 'sales' -> 'payments' ->> 'card')::numeric from d),
          (select (j -> 'sales' ->> 'net_sales')::numeric from d), 'payment modes add up to net sales');
select is((select (e ->> 'in_use')::int from d, jsonb_array_elements(j -> 'occupancy') e where e ->> 'type' = 'pc'), 1,
          'one PC in use (the finished session does not count)');
select is((select (e ->> 'total')::int from d, jsonb_array_elements(j -> 'occupancy') e where e ->> 'type' = 'pc'),
          (select count(*)::int from stations where active and type = 'pc'), 'PC total is the active PCs');
select is((select (j -> 'bookings' ->> 'no_show')::int from d), 1, 'one no-show today');
select is((select (j -> 'bookings' ->> 'cancelled')::int from d), 1, 'one cancellation today');
select ok((select jsonb_array_length(j -> 'low_stock') from d) >= 1, 'a low-stock item is listed');
select is((select (j -> 'low_stock' -> 0 ->> 'stock_qty')::int from d), 1, 'the emptiest first');

select is((select count(*)::int from sales_trend(30)), 30, 'the trend has one row per day');
select is((select day from sales_trend(30) order by day limit 1), ((now() at time zone 'Asia/Kolkata')::date - 29), 'starting 29 days ago');
select is((select sales from sales_trend(30) order by day desc limit 1), 200::numeric, 'today''s trend sales');
select is((select sales from sales_trend(30) order by day desc offset 1 limit 1), 80::numeric, 'yesterday''s trend sales');
select ok((select max(occupancy) from sales_trend(30)) between 0 and 100, 'occupancy is a percentage');
select is((select count(*)::int from sales_trend(7)), 7, 'a shorter trend');

select is((select count(*)::int from busy_hours(30)), 24, 'busy hours has all 24 hours');
select is((select sum(session_count)::int from busy_hours(30)), 2, 'two sessions in total');
select is((select sum(sales) from busy_hours(30)), 140::numeric, 'sales follow the session start hour (void and walk-in excluded)');

select is((select (sales_report((now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date) ->> 'net_sales')::numeric), 280::numeric, 'a range includes both days');
select is((select jsonb_array_length(sales_report((now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date) -> 'daily')), 2, 'with a row per day');
select is((select sales_report((now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date) -> 'top_items' -> 0 ->> 'name'), 'Chips', 'top item by amount');
select is((select (sales_report((now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date) -> 'top_items' -> 1 ->> 'qty')::int), 2, 'Cola counts only the paid bill');
select is((select jsonb_array_length(sales_report((now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date) -> 'top_items')), 2, 'gaming lines are not items');
select throws_ok($$select sales_report((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date - 1)$$, 'Choose a valid date range', 'a backwards range is refused');
select throws_like($$select sales_report((now() at time zone 'Asia/Kolkata')::date - 400, (now() at time zone 'Asia/Kolkata')::date)$$, 'Choose a range of at most one year', 'too long a range is refused');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select dashboard_today()$$, '42501', null, 'staff cannot open the dashboard');
select throws_ok($$select * from sales_trend(30)$$, '42501', null, 'staff cannot read the trend');
select throws_ok($$select * from busy_hours(30)$$, '42501', null, 'staff cannot read busy hours');
select throws_ok($$select sales_report((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date)$$, '42501', null, 'staff cannot read a range report');
select is((select (today_report() ->> 'net_sales')::numeric), 200::numeric, 'staff get today''s report');
select is((select today_report() ->> 'from'), to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'), 'which is only today');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select today_report()$$, '42501', null, 'a customer cannot read the report');
select throws_ok($$select dashboard_today()$$, '42501', null, 'nor the dashboard');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select today_report()$$, '42501', null, 'a visitor cannot read the report');
select throws_ok($$select dashboard_today()$$, '42501', null, 'nor the dashboard');
reset role;

select * from finish();
rollback;
