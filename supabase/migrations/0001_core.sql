-- 0001_core.sql : profiles, settings, stations, packages, products, stock_moves,
-- role helpers, promote_admin, stock_move RPC. RLS on every table.

-- ---------- types ----------
create type user_role as enum ('admin', 'staff', 'customer');
create type stock_move_type as enum ('purchase', 'sale', 'wastage', 'adjust', 'void');

-- ---------- tables ----------
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  role       user_role not null default 'customer',
  active     boolean   not null default true,
  created_at timestamptz not null default now()
);

-- one row only: id is always true
create table settings (
  id                boolean primary key default true check (id),
  shop_name         text    not null default 'E Gaming Era',
  address           text,
  phone             text,
  gstin             text,
  upi_id            text,
  upi_payee_name    text,
  receipt_width     int     not null default 80 check (receipt_width in (58, 80)),
  receipt_footer    text    not null default 'Thank you! Visit again.',
  billing_block_min int     not null default 15 check (billing_block_min > 0),
  min_bill_min      int     not null default 30 check (min_bill_min >= 0),
  updated_at        timestamptz not null default now()
);
insert into settings default values;

create table stations (
  id              bigint generated always as identity primary key,
  name            text not null unique check (length(btrim(name)) > 0),
  type            text not null check (length(btrim(type)) > 0),   -- 'pc', 'ps5', ...
  rate_per_hour   numeric(10,2) not null check (rate_per_hour >= 0),
  sort_order      int  not null default 0,
  active          boolean not null default true,
  online_bookable boolean not null default true
);

create table packages (
  id           bigint generated always as identity primary key,
  name         text not null unique check (length(btrim(name)) > 0),
  minutes      int  not null check (minutes > 0),
  price        numeric(10,2) not null check (price >= 0),
  station_type text not null,
  active       boolean not null default true
);

create table products (
  id              bigint generated always as identity primary key,
  name            text not null unique check (length(btrim(name)) > 0),
  category        text not null default 'General',
  price           numeric(10,2) not null check (price >= 0),
  stock_qty       int  not null default 0 check (stock_qty >= 0),
  low_stock_level int  not null default 0 check (low_stock_level >= 0),
  track_stock     boolean not null default true,
  active          boolean not null default true
);

create table stock_moves (
  id         bigint generated always as identity primary key,
  product_id bigint not null references products (id),
  move_type  stock_move_type not null,
  qty        int  not null check (qty <> 0),          -- signed: + adds stock, - removes
  note       text,
  bill_no    bigint,                                  -- FK added in 0002
  user_id    uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index stock_moves_product_idx on stock_moves (product_id, created_at desc);

-- ---------- role helpers ----------
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active)
$$;

-- admin or active staff
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role in ('admin', 'staff') and active)
$$;

-- Bootstrap: run once in the SQL editor (not callable from the app).
create function promote_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No user with email %', p_email; end if;
  insert into profiles (id, role, active) values (v_id, 'admin', true)
  on conflict (id) do update set role = 'admin', active = true;
end $$;

-- ---------- stock_move RPC ----------
-- p_reason: 'purchase' (qty > 0 adds), 'wastage' (qty > 0 removes), 'adjust' (signed qty).
create function stock_move(p_product bigint, p_qty int, p_reason text, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_delta int;
  v_stock int;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_qty is null or p_qty = 0 then raise exception 'Quantity must not be zero'; end if;

  case p_reason
    when 'purchase' then
      if p_qty < 0 then raise exception 'Purchase quantity must be positive'; end if;
      v_delta := p_qty;
    when 'wastage' then
      if p_qty < 0 then raise exception 'Wastage quantity must be positive'; end if;
      v_delta := -p_qty;
    when 'adjust' then
      v_delta := p_qty;
    else
      raise exception 'Reason must be purchase, wastage or adjust';
  end case;

  if p_reason in ('wastage', 'adjust') and coalesce(btrim(p_note), '') = '' then
    raise exception 'A note is required for wastage and adjustments';
  end if;

  select stock_qty into v_stock from products where id = p_product for update;
  if not found then raise exception 'Product not found'; end if;
  if v_stock + v_delta < 0 then raise exception 'Not enough stock'; end if;

  update products set stock_qty = stock_qty + v_delta where id = p_product;
  insert into stock_moves (product_id, move_type, qty, note)
  values (p_product, p_reason::stock_move_type, v_delta, p_note);
  return v_stock + v_delta;
end $$;

-- ---------- privileges + RLS ----------
revoke all on profiles, settings, stations, packages, products, stock_moves from anon, authenticated;

-- profiles: own row, or admin sees all; only admin changes anything
grant select on profiles to authenticated;
grant update (full_name, phone, role, active) on profiles to authenticated;
alter table profiles enable row level security;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_admin());
create policy profiles_update_admin on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

-- masters: staff read, admin write
grant select on settings, stations, packages, products, stock_moves to authenticated;

grant update (shop_name, address, phone, gstin, upi_id, upi_payee_name, receipt_width,
              receipt_footer, billing_block_min, min_bill_min, updated_at)
  on settings to authenticated;
alter table settings enable row level security;
create policy settings_select on settings for select to authenticated using (is_staff());
create policy settings_update on settings for update to authenticated
  using (is_admin()) with check (is_admin());

grant insert, update, delete on stations to authenticated;
alter table stations enable row level security;
create policy stations_select on stations for select to authenticated using (is_staff());
create policy stations_insert on stations for insert to authenticated with check (is_admin());
create policy stations_update on stations for update to authenticated
  using (is_admin()) with check (is_admin());
create policy stations_delete on stations for delete to authenticated using (is_admin());

grant insert, update, delete on packages to authenticated;
alter table packages enable row level security;
create policy packages_select on packages for select to authenticated using (is_staff());
create policy packages_insert on packages for insert to authenticated with check (is_admin());
create policy packages_update on packages for update to authenticated
  using (is_admin()) with check (is_admin());
create policy packages_delete on packages for delete to authenticated using (is_admin());

-- products: stock_qty is NOT writable directly; only stock_move / checkout / void change it
grant insert (name, category, price, low_stock_level, track_stock, active) on products to authenticated;
grant update (name, category, price, low_stock_level, track_stock, active) on products to authenticated;
alter table products enable row level security;
create policy products_select on products for select to authenticated using (is_staff());
create policy products_insert on products for insert to authenticated with check (is_admin());
create policy products_update on products for update to authenticated
  using (is_admin()) with check (is_admin());

-- stock_moves: read only for staff; written by RPCs
alter table stock_moves enable row level security;
create policy stock_moves_select on stock_moves for select to authenticated using (is_staff());

-- function execute rights
revoke execute on function is_admin(), is_staff(), promote_admin(text),
                           stock_move(bigint, int, text, text) from public, anon;
revoke execute on function promote_admin(text) from authenticated;
grant  execute on function is_admin(), is_staff(), stock_move(bigint, int, text, text) to authenticated;
