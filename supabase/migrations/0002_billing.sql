-- 0002_billing.sql : sessions, tab_items, bills, bill_items, payments,
-- session_charge, session RPCs, checkout_bill, void_bill. RLS on every table.
-- Money, stock and sessions change ONLY through the functions below.

create type session_status as enum ('running', 'paused', 'ended', 'billed', 'cancelled');
create type pay_mode as enum ('cash', 'upi', 'card');

-- ---------- tables ----------
create table sessions (
  id             bigint generated always as identity primary key,
  station_id     bigint not null references stations (id),
  customer_name  text,
  customer_phone text,
  -- snapshots taken at start: later settings/rate changes never affect a running session
  rate_per_hour  numeric(10,2) not null,
  block_min      int not null,
  min_bill_min   int not null,
  package_id     bigint references packages (id),
  package_name   text,
  package_minutes int,
  package_price  numeric(10,2),
  started_at     timestamptz not null default now(),
  paused_at      timestamptz,
  paused_seconds int not null default 0,
  ended_at       timestamptz,
  status         session_status not null default 'running',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
-- one open (not yet billed/cancelled) session per station
create unique index sessions_one_open_per_station
  on sessions (station_id) where status in ('running', 'paused', 'ended');

create table tab_items (
  id         bigint generated always as identity primary key,
  session_id bigint not null references sessions (id),
  product_id bigint not null references products (id),
  qty        int not null check (qty > 0),
  added_by   uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (session_id, product_id)
);

create table bills (
  bill_no        bigint generated always as identity primary key,
  session_id     bigint references sessions (id),
  customer_name  text,
  gaming_charge  numeric(10,2) not null default 0 check (gaming_charge >= 0),
  canteen_total  numeric(10,2) not null default 0 check (canteen_total >= 0),
  subtotal       numeric(10,2) not null check (subtotal >= 0),
  discount       numeric(10,2) not null default 0 check (discount >= 0),
  total          numeric(10,2) not null check (total >= 0),
  status         text not null default 'paid' check (status in ('paid', 'void')),
  void_reason    text,
  voided_by      uuid,
  voided_at      timestamptz,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check (discount <= subtotal),
  check (total = subtotal - discount)
);

create table bill_items (
  id         bigint generated always as identity primary key,
  bill_no    bigint not null references bills (bill_no),
  kind       text not null check (kind in ('gaming', 'item')),
  product_id bigint references products (id),
  name       text not null,
  qty        int not null check (qty > 0),
  unit_price numeric(10,2) not null,
  amount     numeric(10,2) not null
);
create index bill_items_bill_idx on bill_items (bill_no);

create table payments (
  id        bigint generated always as identity primary key,
  bill_no   bigint not null references bills (bill_no),
  mode      pay_mode not null,
  amount    numeric(10,2) not null check (amount > 0),
  reference text
);
create index payments_bill_idx on payments (bill_no);

alter table stock_moves add constraint stock_moves_bill_fk foreign key (bill_no) references bills (bill_no);

-- ---------- gaming charge (internal) ----------
-- Played time = elapsed - paused. Per hour: round up to billing block, at least min bill.
-- Package: fixed price within package minutes; overtime in billing blocks at hourly rate.
create function session_charge(p_session bigint, p_end timestamptz default now())
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

-- ---------- session RPCs ----------
create function start_session(p_station bigint, p_package bigint default null,
                              p_name text default null, p_phone text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  st  stations;
  pk  packages;
  cfg settings;
  v_id bigint;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into st from stations where id = p_station and active;
  if not found then raise exception 'Station not found or inactive'; end if;
  if p_package is not null then
    select * into pk from packages where id = p_package and active;
    if not found then raise exception 'Package not found or inactive'; end if;
    if pk.station_type <> st.type then raise exception 'Package is not for this station type'; end if;
  end if;
  select * into cfg from settings;

  begin
    insert into sessions (station_id, customer_name, customer_phone, rate_per_hour, block_min,
                          min_bill_min, package_id, package_name, package_minutes, package_price)
    values (p_station, nullif(btrim(p_name), ''), nullif(btrim(p_phone), ''), st.rate_per_hour,
            cfg.billing_block_min, cfg.min_bill_min, pk.id, pk.name, pk.minutes, pk.price)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Station already has an open session';
  end;
  return v_id;
end $$;

create function pause_session(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status <> 'running' then raise exception 'Only a running session can be paused'; end if;
  update sessions set status = 'paused', paused_at = now() where id = p_session;
end $$;

create function resume_session(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status <> 'paused' then raise exception 'Only a paused session can be resumed'; end if;
  update sessions
     set status = 'running',
         paused_seconds = paused_seconds + extract(epoch from (now() - paused_at))::int,
         paused_at = null
   where id = p_session;
end $$;

-- Stop the timer. Returns the gaming charge at the stop time. Safe to call on an ended session.
create function end_session(p_session bigint) returns numeric
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status in ('running', 'paused') then
    update sessions
       set status = 'ended',
           ended_at = now(),
           paused_seconds = paused_seconds
             + case when paused_at is not null
                    then extract(epoch from (now() - paused_at))::int else 0 end,
           paused_at = null
     where id = p_session;
  elsif s.status <> 'ended' then
    raise exception 'Session is already billed or cancelled';
  end if;
  return session_charge(p_session, (select ended_at from sessions where id = p_session));
end $$;

-- Customer continues after Stop: the gap between stop and reopen is not charged.
create function reopen_session(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status <> 'ended' then raise exception 'Only an ended session can be reopened'; end if;
  update sessions
     set status = 'running',
         paused_seconds = paused_seconds + extract(epoch from (now() - ended_at))::int,
         ended_at = null
   where id = p_session;
end $$;

-- Admin only; only when the tab is empty.
create function cancel_session(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then
    raise exception 'Session is already billed or cancelled';
  end if;
  if exists (select 1 from tab_items where session_id = p_session) then
    raise exception 'Remove tab items before cancelling';
  end if;
  update sessions
     set status = 'cancelled', ended_at = coalesce(ended_at, now()), paused_at = null
   where id = p_session;
end $$;

-- ---------- tab items ----------
-- Stock is only deducted at checkout, but tabs may not promise more than is available:
-- stock >= qty already on every open tab (all stations) + the new qty.
create function add_tab_item(p_session bigint, p_product bigint, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare
  s sessions;
  p products;
  v_reserved int;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;

  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then
    raise exception 'Session is already billed or cancelled';
  end if;

  select * into p from products where id = p_product for update;
  if not found or not p.active then raise exception 'Product not found or inactive'; end if;

  if p.track_stock then
    select coalesce(sum(t.qty), 0) into v_reserved
      from tab_items t join sessions x on x.id = t.session_id
     where t.product_id = p_product and x.status in ('running', 'paused', 'ended');
    if p.stock_qty < v_reserved + p_qty then raise exception 'Not enough stock'; end if;
  end if;

  insert into tab_items (session_id, product_id, qty) values (p_session, p_product, p_qty)
  on conflict (session_id, product_id) do update set qty = tab_items.qty + excluded.qty;
end $$;

-- Reduce a line by p_qty; null removes the whole line.
create function remove_tab_item(p_session bigint, p_product bigint, p_qty int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s sessions;
  t tab_items;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then
    raise exception 'Session is already billed or cancelled';
  end if;
  select * into t from tab_items where session_id = p_session and product_id = p_product for update;
  if not found then raise exception 'Item is not on this tab'; end if;
  if p_qty is null or p_qty >= t.qty then
    delete from tab_items where id = t.id;
  elsif p_qty <= 0 then
    raise exception 'Quantity must be positive';
  else
    update tab_items set qty = qty - p_qty where id = t.id;
  end if;
end $$;

-- ---------- checkout ----------
-- p = {
--   "session_id": 12 | null,                    -- station bill; omit for walk-in canteen sale
--   "items": [{"product_id": 1, "qty": 2}],     -- walk-in only (a station bill uses its tab)
--   "customer_name": "Raj",
--   "discount": 5,
--   "payments": [{"mode":"cash","amount":115,"reference":null}, {"mode":"upi","amount":200}]
-- }
-- Everything is recomputed here; amounts sent by the device are only the payment split.
-- All validation happens before the bill row is created, so failed attempts do not burn bill numbers.
create function checkout_bill(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_sid      bigint := nullif(p->>'session_id', '')::bigint;
  s          sessions;
  v_station  text;
  v_lines    jsonb;
  v_out      jsonb := '[]';
  r          record;
  v_expected int;
  v_seen     int := 0;
  v_gaming   numeric(10,2) := 0;
  v_canteen  numeric(10,2) := 0;
  v_subtotal numeric(10,2);
  v_discount numeric(10,2) := coalesce(nullif(p->>'discount', '')::numeric, 0);
  v_total    numeric(10,2);
  v_paid     numeric(10,2) := 0;
  v_cust     text := nullif(btrim(coalesce(p->>'customer_name', '')), '');
  pay        jsonb;
  v_amt      numeric;
  v_bill     bigint;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;

  -- 1. session (stop timer if still running) and the lines to bill
  if v_sid is not null then
    select * into s from sessions where id = v_sid for update;
    if not found then raise exception 'Session not found'; end if;
    if s.status not in ('running', 'paused', 'ended') then
      raise exception 'Session is already billed or cancelled';
    end if;
    if jsonb_array_length(coalesce(p->'items', '[]')) > 0 then
      raise exception 'A station bill uses the tab items; do not send items';
    end if;
    perform end_session(v_sid);
    v_gaming := session_charge(v_sid, (select ended_at from sessions where id = v_sid));
    select name into v_station from stations where id = s.station_id;
    v_cust := coalesce(v_cust, s.customer_name);
    select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty)), '[]')
      into v_lines from tab_items where session_id = v_sid;
  else
    v_lines := coalesce(p->'items', '[]');
    if jsonb_array_length(v_lines) = 0 then raise exception 'Nothing to bill'; end if;
  end if;

  -- 2. canteen lines: server prices, stock check with row locks (ordered to avoid deadlocks)
  if exists (select 1 from jsonb_array_elements(v_lines) x
             where coalesce((x->>'qty')::int, 0) <= 0 or (x->>'product_id') is null) then
    raise exception 'Invalid item quantity';
  end if;
  select count(distinct (x->>'product_id')::bigint) into v_expected from jsonb_array_elements(v_lines) x;

  for r in
    select pr.id, pr.name, pr.price, pr.track_stock, pr.stock_qty, l.qty
      from (select (x->>'product_id')::bigint as pid, sum((x->>'qty')::int)::int as qty
              from jsonb_array_elements(v_lines) x group by 1) l
      join products pr on pr.id = l.pid
     order by pr.id
       for update of pr
  loop
    v_seen := v_seen + 1;
    if r.track_stock and r.stock_qty < r.qty then
      raise exception 'Not enough stock: %', r.name;
    end if;
    v_canteen := v_canteen + r.price * r.qty;
    v_out := v_out || jsonb_build_object('product_id', r.id, 'name', r.name, 'price', r.price,
                                         'qty', r.qty, 'track', r.track_stock);
  end loop;
  if v_seen <> v_expected then raise exception 'Product not found'; end if;

  -- 3. totals, discount, payments
  v_subtotal := v_gaming + v_canteen;
  if v_sid is null and v_subtotal = 0 then raise exception 'Nothing to bill'; end if;
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Discount must be between 0 and the subtotal';
  end if;
  v_total := v_subtotal - v_discount;

  for pay in select * from jsonb_array_elements(coalesce(p->'payments', '[]')) loop
    if (pay->>'mode') not in ('cash', 'upi', 'card') then raise exception 'Invalid payment mode'; end if;
    v_amt := coalesce(nullif(pay->>'amount', '')::numeric, 0);
    if v_amt < 0 or round(v_amt, 2) <> v_amt then raise exception 'Invalid payment amount'; end if;
    v_paid := v_paid + v_amt;
  end loop;
  if v_paid <> v_total then
    raise exception 'Payments must equal the total (paid %, total %)', v_paid, v_total;
  end if;

  -- 4. write: bill, lines, payments, stock, session
  insert into bills (session_id, customer_name, gaming_charge, canteen_total, subtotal, discount, total)
  values (v_sid, v_cust, v_gaming, v_canteen, v_subtotal, v_discount, v_total)
  returning bill_no into v_bill;

  if v_sid is not null then
    insert into bill_items (bill_no, kind, name, qty, unit_price, amount)
    values (v_bill, 'gaming', 'Gaming - ' || v_station
              || coalesce(' (' || s.package_name || ')', ''), 1, v_gaming, v_gaming);
  end if;

  for r in select * from jsonb_to_recordset(v_out)
           as x(product_id bigint, name text, price numeric, qty int, track boolean) loop
    insert into bill_items (bill_no, kind, product_id, name, qty, unit_price, amount)
    values (v_bill, 'item', r.product_id, r.name, r.qty, r.price, r.price * r.qty);
    if r.track then
      update products set stock_qty = stock_qty - r.qty where id = r.product_id;
      insert into stock_moves (product_id, move_type, qty, note, bill_no)
      values (r.product_id, 'sale', -r.qty, 'Bill ' || v_bill, v_bill);
    end if;
  end loop;

  for pay in select * from jsonb_array_elements(coalesce(p->'payments', '[]')) loop
    if coalesce(nullif(pay->>'amount', '')::numeric, 0) > 0 then
      insert into payments (bill_no, mode, amount, reference)
      values (v_bill, (pay->>'mode')::pay_mode, (pay->>'amount')::numeric,
              nullif(btrim(coalesce(pay->>'reference', '')), ''));
    end if;
  end loop;

  if v_sid is not null then
    update sessions set status = 'billed' where id = v_sid;
  end if;
  return v_bill;
end $$;

-- ---------- void (admin) ----------
create function void_bill(p_bill_no bigint, p_reason text) returns void
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
end $$;

-- ---------- privileges + RLS: staff read, nobody writes directly ----------
revoke all on sessions, tab_items, bills, bill_items, payments from anon, authenticated;
grant select on sessions, tab_items, bills, bill_items, payments to authenticated;

alter table sessions   enable row level security;
alter table tab_items  enable row level security;
alter table bills      enable row level security;
alter table bill_items enable row level security;
alter table payments   enable row level security;

create policy sessions_select   on sessions   for select to authenticated using (is_staff());
create policy tab_items_select  on tab_items  for select to authenticated using (is_staff());
create policy bills_select      on bills      for select to authenticated using (is_staff());
create policy bill_items_select on bill_items for select to authenticated using (is_staff());
create policy payments_select   on payments   for select to authenticated using (is_staff());

-- function execute rights
revoke execute on function
  session_charge(bigint, timestamptz),
  start_session(bigint, bigint, text, text), pause_session(bigint), resume_session(bigint),
  end_session(bigint), reopen_session(bigint), cancel_session(bigint),
  add_tab_item(bigint, bigint, int), remove_tab_item(bigint, bigint, int),
  checkout_bill(jsonb), void_bill(bigint, text)
  from public, anon;
revoke execute on function session_charge(bigint, timestamptz) from authenticated;
grant execute on function
  start_session(bigint, bigint, text, text), pause_session(bigint), resume_session(bigint),
  end_session(bigint), reopen_session(bigint), cancel_session(bigint),
  add_tab_item(bigint, bigint, int), remove_tab_item(bigint, bigint, int),
  checkout_bill(jsonb), void_bill(bigint, text)
  to authenticated;

-- live sync for counters
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table sessions, tab_items;
  end if;
end $$;
