-- 0012_passes.sql : prepaid passes (memberships).
-- A pass is sold at the counter (staff) and covers play on one game type (or all) for a number of days:
--   kind 'unlimited' : play is free of gaming charge while the pass is valid
--   kind 'hours'     : a bundle of minutes; time played is taken off the balance, any extra is billed normally
-- Canteen items are always billed. Passes are sold through a bill (so they show in sales and reports),
-- and a voided pass bill cancels the pass. Money and balances change only through the functions below.

-- ---------- tables ----------
create table pass_types (
  id            bigint generated always as identity primary key,
  name          text not null unique check (length(btrim(name)) > 0),
  price         numeric(10,2) not null check (price >= 0),
  validity_days int  not null check (validity_days between 1 and 366),
  station_type  text,                                  -- null = every station type
  kind          text not null check (kind in ('unlimited', 'hours')),
  minutes_total int  check (minutes_total > 0),        -- hours bundle, in minutes
  active        boolean not null default true,
  check ((kind = 'hours') = (minutes_total is not null))
);

create table customer_passes (
  id             bigint generated always as identity primary key,
  customer_id    bigint not null references customers (id),
  pass_type_id   bigint not null references pass_types (id),
  name           text not null,                        -- snapshots, so later edits never change a sold pass
  kind           text not null check (kind in ('unlimited', 'hours')),
  station_type   text,
  price          numeric(10,2) not null,
  minutes_total  int,
  minutes_used   int not null default 0 check (minutes_used >= 0),
  starts_at      timestamptz not null default now(),
  expires_at     timestamptz not null,
  status         text not null default 'active' check (status in ('active', 'cancelled')),
  bill_no        bigint references bills (bill_no),
  cancelled_at   timestamptz,
  cancelled_reason text,
  sold_by        uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index customer_passes_customer_idx on customer_passes (customer_id);

-- bills and sessions know about passes
alter table bills add column pass_total numeric(10,2) not null default 0 check (pass_total >= 0);

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'bill_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%gaming%';
  if c is not null then execute format('alter table bill_items drop constraint %I', c); end if;
end $$;
alter table bill_items add constraint bill_items_kind_check check (kind in ('gaming', 'item', 'pass'));

alter table sessions
  add column pass_id           bigint references customer_passes (id),
  add column pass_name         text,
  add column pass_minutes_left int,                    -- balance when the session started; null = unlimited
  add column pass_minutes_used int not null default 0; -- taken off the balance when the bill is paid
-- one pass is in use on one station at a time
create unique index sessions_one_open_per_pass on sessions (pass_id)
  where pass_id is not null and status in ('running', 'paused', 'ended');

-- ---------- gaming charge (mirrored in web/src/app/core/pricing.ts) ----------
-- Pass session: unlimited = 0. Hours = time played (rounded up to the billing block) beyond the balance,
-- at the hourly rate; no minimum bill.
create or replace function session_charge(p_session bigint, p_end timestamptz default now())
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  s      sessions;
  v_secs numeric;
  v_min  numeric;
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Session not found'; end if;

  v_secs := extract(epoch from (p_end - s.started_at)) - s.paused_seconds
            - case when s.paused_at is not null
                   then extract(epoch from (p_end - s.paused_at)) else 0 end;
  v_secs := greatest(0, v_secs);

  if s.pass_id is not null then
    if s.pass_minutes_left is null then return 0; end if;
    v_min := ceil(v_secs / (s.block_min * 60.0)) * s.block_min;
    return round(greatest(0, v_min - s.pass_minutes_left) * s.rate_per_hour / 60, 2);
  end if;

  if s.package_minutes is not null then
    if v_secs <= s.package_minutes * 60 then
      return s.package_price;
    end if;
    return s.package_price + round(
      ceil((v_secs - s.package_minutes * 60) / (s.block_min * 60.0)) * s.block_min
      * s.rate_per_hour / 60, 2);
  end if;

  v_min := greatest(ceil(v_secs / (s.block_min * 60.0)) * s.block_min, s.min_bill_min);
  return round(v_min * s.rate_per_hour / 60, 2);
end $$;

-- the balance is taken off when the bill is paid (so a cancelled session costs nothing)
create function session_pass_usage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_secs numeric;
  v_min  numeric;
begin
  if new.status = 'billed' and old.status <> 'billed' and new.pass_id is not null and new.pass_minutes_left is not null then
    v_secs := greatest(0, extract(epoch from (coalesce(new.ended_at, now()) - new.started_at)) - new.paused_seconds);
    v_min  := ceil(v_secs / (new.block_min * 60.0)) * new.block_min;
    new.pass_minutes_used := least(v_min, new.pass_minutes_left)::int;
    update customer_passes set minutes_used = minutes_used + new.pass_minutes_used where id = new.pass_id;
  end if;
  return new;
end $$;

create trigger sessions_pass_usage before update on sessions
  for each row execute function session_pass_usage();

-- ---------- selling ----------
-- p_payments: [{"mode":"cash","amount":399,"reference":null}, ...] must add up to the price.
-- p_email: if it matches a customer who signed in online, the pass goes to that login (so they see it in
-- "My bookings"); otherwise the counter customer with that phone number is used or created.
create function sell_pass(p_pass_type bigint, p_name text, p_phone text, p_email text default null,
                          p_payments jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pt     pass_types;
  v_cust bigint;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_paid numeric(10,2) := 0;
  v_amt  numeric;
  pay    jsonb;
  v_bill bigint;
  v_pass bigint;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into pt from pass_types where id = p_pass_type and active;
  if not found then raise exception 'Pass not found or inactive'; end if;
  if v_name is null then raise exception 'Customer name is required'; end if;

  if nullif(btrim(coalesce(p_email, '')), '') is not null then
    select id into v_cust from customers
     where profile_id is not null and lower(email) = lower(btrim(p_email)) order by id limit 1;
    if not found then raise exception 'No customer has signed in with that email'; end if;
  else
    v_cust := resolve_customer(v_name, p_phone);
  end if;

  for pay in select * from jsonb_array_elements(coalesce(p_payments, '[]')) loop
    if (pay->>'mode') not in ('cash', 'upi', 'card') then raise exception 'Invalid payment mode'; end if;
    v_amt := coalesce(nullif(pay->>'amount', '')::numeric, 0);
    if v_amt < 0 or round(v_amt, 2) <> v_amt then raise exception 'Invalid payment amount'; end if;
    v_paid := v_paid + v_amt;
  end loop;
  if v_paid <> pt.price then
    raise exception 'Payments must equal the price (paid %, price %)', v_paid, pt.price;
  end if;

  insert into bills (session_id, customer_name, gaming_charge, canteen_total, pass_total, subtotal, discount, total)
  values (null, v_name, 0, 0, pt.price, pt.price, 0, pt.price)
  returning bill_no into v_bill;

  insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
  values (v_bill, 'pass', pt.name, 1, pt.price, pt.price);

  for pay in select * from jsonb_array_elements(coalesce(p_payments, '[]')) loop
    if coalesce(nullif(pay->>'amount', '')::numeric, 0) > 0 then
      insert into payments (bill_no, mode, amount, reference)
      values (v_bill, (pay->>'mode')::pay_mode, (pay->>'amount')::numeric,
              nullif(btrim(coalesce(pay->>'reference', '')), ''));
    end if;
  end loop;

  insert into customer_passes (customer_id, pass_type_id, name, kind, station_type, price, minutes_total,
                               expires_at, bill_no)
  values (v_cust, pt.id, pt.name, pt.kind, pt.station_type, pt.price, pt.minutes_total,
          now() + make_interval(days => pt.validity_days), v_bill)
  returning id into v_pass;

  return jsonb_build_object('pass_id', v_pass, 'bill_no', v_bill);
end $$;

-- ---------- using a pass ----------
create function start_pass_session(p_station bigint, p_pass bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  st    stations;
  cp    customer_passes;
  c     customers;
  cfg   settings;
  v_left int;
  v_id  bigint;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into st from stations where id = p_station and active;
  if not found then raise exception 'Station not found or inactive'; end if;
  select * into cp from customer_passes where id = p_pass for update;
  if not found then raise exception 'Pass not found'; end if;
  if cp.status <> 'active' then raise exception 'This pass was cancelled'; end if;
  if now() < cp.starts_at or now() >= cp.expires_at then raise exception 'This pass has expired'; end if;
  if cp.station_type is not null and cp.station_type <> st.type then
    raise exception 'This pass is not valid for this station type';
  end if;
  if cp.kind = 'hours' then
    v_left := cp.minutes_total - cp.minutes_used;
    if v_left <= 0 then raise exception 'No hours left on this pass'; end if;
  end if;
  select * into c from customers where id = cp.customer_id;
  select * into cfg from settings;

  begin
    insert into sessions (station_id, customer_name, customer_phone, rate_per_hour, block_min, min_bill_min,
                          pass_id, pass_name, pass_minutes_left)
    values (p_station, c.name, c.phone, st.rate_per_hour, cfg.billing_block_min, cfg.min_bill_min,
            cp.id, cp.name, v_left)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from sessions where pass_id = cp.id and status in ('running', 'paused', 'ended')) then
      raise exception 'This pass is already in use on another station';
    end if;
    raise exception 'Station already has an open session';
  end;
  return v_id;
end $$;

-- staff find a customer's usable passes by phone number
create function lookup_passes(p_phone text)
returns table (pass_id bigint, customer_name text, customer_phone text, name text, kind text,
               station_type text, minutes_left int, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare k text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if length(k) < 7 then return; end if;
  return query
    select cp.id, c.name, c.phone, cp.name, cp.kind, cp.station_type,
           case when cp.kind = 'hours' then cp.minutes_total - cp.minutes_used end, cp.expires_at
      from customer_passes cp join customers c on c.id = cp.customer_id
     where regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = k
       and cp.status = 'active' and now() >= cp.starts_at and now() < cp.expires_at
       and (cp.kind = 'unlimited' or cp.minutes_total > cp.minutes_used)
     order by cp.expires_at;
end $$;

-- a customer's own passes (newest first)
create function my_passes()
returns table (id bigint, name text, kind text, station_type text, minutes_left int,
               starts_at timestamptz, expires_at timestamptz, state text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  return query
    select cp.id, cp.name, cp.kind, cp.station_type,
           case when cp.kind = 'hours' then cp.minutes_total - cp.minutes_used end,
           cp.starts_at, cp.expires_at,
           case when cp.status = 'cancelled' then 'cancelled'
                when now() >= cp.expires_at then 'expired'
                when cp.kind = 'hours' and cp.minutes_total <= cp.minutes_used then 'used up'
                else 'active' end
      from customer_passes cp join customers c on c.id = cp.customer_id
     where c.profile_id = auth.uid()
     order by cp.created_at desc limit 20;
end $$;

-- ---------- cancelling (admin) ----------
create function cancel_pass(p_pass bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare cp customer_passes;
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into cp from customer_passes where id = p_pass for update;
  if not found then raise exception 'Pass not found'; end if;
  if cp.status = 'cancelled' then raise exception 'Pass is already cancelled'; end if;
  if exists (select 1 from sessions where pass_id = p_pass and status in ('running', 'paused', 'ended')) then
    raise exception 'This pass is in use. Bill the session first';
  end if;
  update customer_passes set status = 'cancelled', cancelled_at = now(), cancelled_reason = btrim(p_reason)
   where id = p_pass;
end $$;

-- ---------- voiding a bill also undoes its pass effects ----------
create or replace function void_bill(p_bill_no bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b bills;
  r record;
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into b from bills where bill_no = p_bill_no for update;
  if not found then raise exception 'Bill not found'; end if;
  if b.status = 'void' then raise exception 'Bill is already void'; end if;

  update bills set status = 'void', void_reason = btrim(p_reason),
                   voided_by = auth.uid(), voided_at = now()
   where bill_no = p_bill_no;

  -- restore exactly what the sale deducted
  for r in select product_id, -sum(qty)::int as qty from stock_moves
            where bill_no = p_bill_no and move_type = 'sale'
            group by product_id order by product_id loop
    perform 1 from products where id = r.product_id for update;
    update products set stock_qty = stock_qty + r.qty where id = r.product_id;
    insert into stock_moves (product_id, move_type, qty, note, bill_no)
    values (r.product_id, 'void', r.qty, 'Void bill ' || p_bill_no || ': ' || btrim(p_reason), p_bill_no);
  end loop;

  -- hours that this bill took off a pass go back; a pass sold on this bill is cancelled
  update customer_passes cp set minutes_used = greatest(0, cp.minutes_used - s.pass_minutes_used)
    from sessions s where s.id = b.session_id and s.pass_id = cp.id and s.pass_minutes_used > 0;
  update customer_passes set status = 'cancelled', cancelled_at = now(),
                             cancelled_reason = 'Bill ' || p_bill_no || ' voided'
   where bill_no = p_bill_no and status = 'active';
end $$;

-- ---------- reports: a "passes" line ----------
create or replace function report_core(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r  jsonb;
begin
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'bills',     count(*) filter (where status = 'paid'),
    'net_sales', coalesce(sum(total) filter (where status = 'paid'), 0),
    'gaming',    coalesce(sum(gaming_charge) filter (where status = 'paid'), 0),
    'canteen',   coalesce(sum(canteen_total) filter (where status = 'paid'), 0),
    'passes',    coalesce(sum(pass_total) filter (where status = 'paid'), 0),
    'discounts', coalesce(sum(discount) filter (where status = 'paid'), 0),
    'void_count', count(*) filter (where status = 'void'),
    'void_value', coalesce(sum(total) filter (where status = 'void'), 0))
    into r
    from bills where created_at >= t0 and created_at < t1;

  r := r || jsonb_build_object(
    'payments', (select jsonb_build_object(
                   'cash', coalesce(sum(p.amount) filter (where p.mode = 'cash'), 0),
                   'upi',  coalesce(sum(p.amount) filter (where p.mode = 'upi'), 0),
                   'card', coalesce(sum(p.amount) filter (where p.mode = 'card'), 0))
                   from payments p join bills b on b.bill_no = p.bill_no
                  where b.status = 'paid' and b.created_at >= t0 and b.created_at < t1),
    'top_items', (select coalesce(jsonb_agg(x order by x.amount desc, x.name), '[]'::jsonb)
                    from (select i.name, sum(i.qty)::int as qty, sum(i.amount) as amount
                            from bill_items i join bills b on b.bill_no = i.bill_no
                           where i.kind = 'item' and b.status = 'paid' and b.created_at >= t0 and b.created_at < t1
                           group by i.name order by sum(i.amount) desc, i.name limit 10) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                       'day', d.day,
                       'bills',     coalesce(a.bills, 0),
                       'sales',     coalesce(a.sales, 0),
                       'gaming',    coalesce(a.gaming, 0),
                       'canteen',   coalesce(a.canteen, 0),
                       'passes',    coalesce(a.passes, 0),
                       'discounts', coalesce(a.discounts, 0),
                       'voids',     coalesce(a.voids, 0)) order by d.day), '[]'::jsonb)
                from generate_series(p_from, p_to, interval '1 day') g(d0),
                     lateral (select g.d0::date as day) d
                left join (select (created_at at time zone 'Asia/Kolkata')::date as day,
                                  count(*) filter (where status = 'paid') as bills,
                                  sum(total) filter (where status = 'paid') as sales,
                                  sum(gaming_charge) filter (where status = 'paid') as gaming,
                                  sum(canteen_total) filter (where status = 'paid') as canteen,
                                  sum(pass_total) filter (where status = 'paid') as passes,
                                  sum(discount) filter (where status = 'paid') as discounts,
                                  count(*) filter (where status = 'void') as voids
                             from bills where created_at >= t0 and created_at < t1 group by 1) a on a.day = d.day));
  return r;
end $$;

create or replace function dashboard_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  t0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sales', (report_core(v_today, v_today) - 'daily' - 'top_items'),
    'occupancy', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'total', total, 'in_use', in_use) order by type), '[]'::jsonb)
                    from (select st.type, count(*)::int as total,
                                 count(*) filter (where exists (select 1 from sessions s
                                                                 where s.station_id = st.id and s.status in ('running', 'paused')))::int as in_use
                            from stations st where st.active group by st.type) o),
    'bookings', (select jsonb_build_object(
                   'upcoming',   count(*) filter (where status = 'confirmed' and end_at > now()),
                   'checked_in', count(*) filter (where status in ('checked_in', 'completed')),
                   'no_show',    count(*) filter (where status = 'no_show'),
                   'cancelled',  count(*) filter (where status = 'cancelled'))
                   from bookings where start_at >= t0 and start_at < t0 + interval '1 day'),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'stock_qty', stock_qty, 'low_stock_level', low_stock_level)
                                            order by stock_qty, name), '[]'::jsonb)
                    from products where active and track_stock and stock_qty <= low_stock_level),
    'active_passes', (select count(*) from customer_passes cp
                       where cp.status = 'active' and now() >= cp.starts_at and now() < cp.expires_at
                         and (cp.kind = 'unlimited' or cp.minutes_total > cp.minutes_used)));
end $$;

-- ---------- privileges + RLS ----------
revoke all on pass_types, customer_passes from anon, authenticated;
grant select on pass_types, customer_passes to authenticated;
grant insert, update, delete on pass_types to authenticated;
alter table pass_types enable row level security;
alter table customer_passes enable row level security;

create policy pass_types_select on pass_types for select to authenticated using (is_staff());
create policy pass_types_insert on pass_types for insert to authenticated with check (is_admin());
create policy pass_types_update on pass_types for update to authenticated using (is_admin()) with check (is_admin());
create policy pass_types_delete on pass_types for delete to authenticated using (is_admin());
create policy customer_passes_select on customer_passes for select to authenticated
  using (is_staff() or customer_id in (select id from customers where profile_id = auth.uid()));

revoke execute on function
  sell_pass(bigint, text, text, text, jsonb), start_pass_session(bigint, bigint), lookup_passes(text),
  my_passes(), cancel_pass(bigint, text), session_pass_usage()
  from public, anon;
revoke execute on function session_pass_usage() from authenticated;
grant execute on function
  sell_pass(bigint, text, text, text, jsonb), start_pass_session(bigint, bigint), lookup_passes(text),
  my_passes(), cancel_pass(bigint, text)
  to authenticated;
