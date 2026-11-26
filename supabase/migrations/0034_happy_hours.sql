-- Phase 46: Happy hours (timed discounts).
--   * The Admin keeps a list of happy-hour rules (name, days of the week, start and end time, percent off, game type) and a
--     list of dates when happy hours do NOT run (holidays, match days). One master switch turns all of it on or off.
--   * The discount is decided by the SERVER when a session starts (India time) and is saved on the session, exactly like the
--     rate and the package price are today: a session keeps what it started with, a running session never changes, and
--     session_charge() is NOT changed (so the billing formula, pricing.ts and the golden tests stay as they are).
--   * Per-hour session: the saved hourly rate is the discounted rate. Package session: the saved package price is the discounted
--     price (and so is the hourly rate used for overtime). Pass sessions are never discounted.
--   * Extending a package session adds the package at the session's own discount, so a session is priced one way throughout.
--   * Rules stay inside one day (start < end). Overlapping rules do not add up: the biggest percent wins.
--   * The master switch starts OFF: nothing changes until the Admin turns it on.

-- ---------- the rules ----------
create table happy_hours (
  id           bigint generated always as identity primary key,
  name         text     not null check (char_length(btrim(name)) between 1 and 60),
  days         smallint[] not null check (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),  -- 0 = Sunday ... 6 = Saturday
  start_time   time     not null,
  end_time     time     not null,
  percent      int      not null check (percent between 1 and 90),
  station_type text     check (station_type is null or char_length(btrim(station_type)) > 0),                                      -- null = every game type
  active       boolean  not null default true,
  created_at   timestamptz not null default now(),
  check (start_time < end_time)
);

create table happy_hour_off_dates (
  day   date primary key,
  label text check (char_length(label) <= 60)
);

alter table settings add column happy_hours_on boolean not null default false;
grant update (happy_hours_on) on settings to authenticated;   -- the existing settings_update policy makes this Admin-only

revoke all on happy_hours, happy_hour_off_dates from anon, authenticated;
grant select, insert, update, delete on happy_hours, happy_hour_off_dates to authenticated;
alter table happy_hours          enable row level security;
alter table happy_hour_off_dates enable row level security;
create policy happy_hours_select on happy_hours for select to authenticated using (is_staff());
create policy happy_hours_insert on happy_hours for insert to authenticated with check (is_admin());
create policy happy_hours_update on happy_hours for update to authenticated using (is_admin()) with check (is_admin());
create policy happy_hours_delete on happy_hours for delete to authenticated using (is_admin());
create policy happy_off_select on happy_hour_off_dates for select to authenticated using (is_staff());
create policy happy_off_insert on happy_hour_off_dates for insert to authenticated with check (is_admin());
create policy happy_off_update on happy_hour_off_dates for update to authenticated using (is_admin()) with check (is_admin());
create policy happy_off_delete on happy_hour_off_dates for delete to authenticated using (is_admin());

-- ---------- what a session remembers ----------
alter table sessions
  add column happy_pct  int  not null default 0 check (happy_pct between 0 and 90),
  add column happy_name text;

-- ---------- which discount is running at a moment (India time) ----------
-- Start time counts, end time does not (3:00 pm to 6:00 pm: 3:00 pm is in, 6:00 pm is out). Nothing when the master switch is off,
-- when the date is on the off-dates list, or when no rule fits. The biggest percent wins.
create function happy_hour_at(p_type text, p_at timestamptz default now())
returns table (percent int, name text, ends_at time)
language sql stable security definer set search_path = public as $$
  select h.percent, h.name, h.end_time
    from happy_hours h
   where (select happy_hours_on from settings)
     and h.active
     and (h.station_type is null or h.station_type = p_type)
     and extract(dow from (p_at at time zone 'Asia/Kolkata'))::smallint = any (h.days)
     and (p_at at time zone 'Asia/Kolkata')::time >= h.start_time
     and (p_at at time zone 'Asia/Kolkata')::time <  h.end_time
     and not exists (select 1 from happy_hour_off_dates o where o.day = (p_at at time zone 'Asia/Kolkata')::date)
   order by h.percent desc, h.id
   limit 1
$$;

revoke execute on function happy_hour_at(text, timestamptz) from public, anon;
grant  execute on function happy_hour_at(text, timestamptz) to authenticated;

-- ---------- starting a session ----------
-- Same as migration 0023, plus the discount. A hourly session saves the discounted rate; a package session saves the discounted price.
create or replace function start_session(p_station bigint, p_package bigint default null,
                                         p_name text default null, p_phone text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  st  stations;
  pk  packages;
  cfg settings;
  v_pct  int;
  v_hname text;
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

  -- the discount in force at this moment (nothing when no happy hour is running)
  select h.percent, h.name into v_pct, v_hname from happy_hour_at(st.type, now()) h;
  v_pct := coalesce(v_pct, 0);

  begin
    insert into sessions (station_id, customer_name, customer_phone, rate_per_hour, block_min,
                          min_bill_min, overtime_grace_min, package_id, package_name, package_minutes, package_price,
                          happy_pct, happy_name)
    values (p_station, nullif(btrim(p_name), ''), nullif(btrim(p_phone), ''),
            round(st.rate_per_hour * (100 - v_pct) / 100.0, 2),
            cfg.billing_block_min, cfg.min_bill_min, cfg.overtime_grace_min, pk.id, pk.name, pk.minutes,
            case when pk.id is null then null else round(pk.price * (100 - v_pct) / 100.0, 2) end,
            v_pct, v_hname)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Station already has an open session';
  end;
  return v_id;
end $$;

-- ---------- extending a package session ----------
-- Same as migration 0025; the package that is added is priced at the session's own discount.
create or replace function extend_session(p_session bigint, p_package bigint default null, p_minutes int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s        sessions;
  pk       packages;
  st       stations;
  v_played numeric;
  v_target int;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then raise exception 'The session is already billed or cancelled'; end if;
  if s.pass_id is not null then raise exception 'A pass session cannot be extended'; end if;
  select * into st from stations where id = s.station_id;

  if s.package_minutes is not null then
    if p_package is null then raise exception 'Choose the package to add'; end if;
    select * into pk from packages where id = p_package and active;
    if not found then raise exception 'Package not found or inactive'; end if;
    if pk.station_type <> st.type then raise exception 'Package is not for this station type'; end if;
  else
    if p_minutes is null or p_minutes < 1 or p_minutes > 600 then raise exception 'Extend by 1 to 600 minutes'; end if;
  end if;

  -- bring a stopped or paused session back to running (the gap is not charged)
  if s.status = 'ended' then
    update sessions
       set status = 'running', paused_seconds = paused_seconds + extract(epoch from (now() - ended_at))::int, ended_at = null
     where id = p_session;
  elsif s.status = 'paused' then
    update sessions
       set status = 'running', paused_seconds = paused_seconds + extract(epoch from (now() - paused_at))::int, paused_at = null
     where id = p_session;
  end if;

  if s.package_minutes is not null then
    -- new package time: staff decide about overtime afresh (an earlier Don't charge or typed amount does not carry over)
    update sessions
       set package_minutes = package_minutes + pk.minutes,
           package_price   = package_price + round(pk.price * (100 - s.happy_pct) / 100.0, 2),
           package_name    = package_name || ' + ' || pk.name,
           overtime_mode   = null,
           overtime_amount = null
     where id = p_session;
  else
    -- the reminder rings p_minutes after now, or p_minutes after the old reminder if that is still ahead
    v_played := greatest(0, extract(epoch from (now() - s.started_at)) - s.paused_seconds
                  - case when s.status = 'ended' then extract(epoch from (now() - s.ended_at)) else 0 end
                  - case when s.status = 'paused' then extract(epoch from (now() - s.paused_at)) else 0 end);
    if s.alarm_minutes is null then
      update sessions set alarm_minutes = least(1440, ceil(v_played / 60)::int + p_minutes), alarm_extra_minutes = 0 where id = p_session;
    else
      v_target := ceil(v_played / 60)::int + p_minutes;
      update sessions
         set alarm_extra_minutes = greatest(alarm_extra_minutes + p_minutes, v_target - alarm_minutes)
       where id = p_session;
    end if;
  end if;
end $$;

-- ---------- the bill says so ----------
-- Done in a trigger (like the pass label in 0013) so checkout_bill stays as it is.
create function bill_item_happy_label() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pct int;
begin
  if new.kind = 'gaming' then
    select s.happy_pct into v_pct from bills b join sessions s on s.id = b.session_id where b.bill_no = new.bill_no;
    if coalesce(v_pct, 0) > 0 then new.name := new.name || ' [Happy hour ' || v_pct || '% off]'; end if;
  end if;
  return new;
end $$;

create trigger bill_items_happy_label before insert on bill_items
  for each row execute function bill_item_happy_label();
revoke execute on function bill_item_happy_label() from public, anon, authenticated;

-- ---------- what the public home page may see ----------
-- Only the running rules and the coming off-dates, and only while the master switch is on. No prices, no staff data.
create function happy_hours_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when s.happy_hours_on then jsonb_build_object(
    'on', true,
    'rules', (select coalesce(jsonb_agg(jsonb_build_object(
                        'name', h.name, 'days', h.days, 'start', to_char(h.start_time, 'HH24:MI'),
                        'end', to_char(h.end_time, 'HH24:MI'), 'percent', h.percent, 'station_type', h.station_type)
                      order by h.start_time, h.id), '[]'::jsonb)
                from happy_hours h where h.active),
    'off_dates', (select coalesce(jsonb_agg(jsonb_build_object('day', o.day, 'label', o.label) order by o.day), '[]'::jsonb)
                    from happy_hour_off_dates o where o.day >= (now() at time zone 'Asia/Kolkata')::date))
  else jsonb_build_object('on', false, 'rules', '[]'::jsonb, 'off_dates', '[]'::jsonb) end
  from settings s
$$;

revoke execute on function happy_hours_info() from public, anon;
grant  execute on function happy_hours_info() to anon, authenticated;
