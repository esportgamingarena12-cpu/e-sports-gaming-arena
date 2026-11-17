-- Phase 34: overtime on a package session.
--   * settings.overtime_grace_min (default 10): time past the package that is not charged unless staff choose to charge it
--   * sessions.overtime_grace_min: that value copied when the session starts (like the block and minimum bill)
--   * sessions.overtime_mode: staff's choice on one session. null = automatic (free inside the grace, charged beyond it),
--     'charge' = always charge the overtime, 'waive' = never charge it
-- Overtime that is charged is billed as before: rounded up to the billing block (15 minutes) at the hourly rate,
-- so 11 to 15 minutes over is one block and 16 to 30 minutes over is two.
-- session_charge() is mirrored in web/src/app/core/pricing.ts: change both together.
alter table settings add column overtime_grace_min int not null default 10 check (overtime_grace_min >= 0 and overtime_grace_min <= 120);
alter table sessions add column overtime_grace_min int not null default 10 check (overtime_grace_min >= 0);
alter table sessions add column overtime_mode text check (overtime_mode in ('charge', 'waive'));

grant update (overtime_grace_min) on settings to authenticated;

create or replace function session_charge(p_session bigint, p_end timestamptz default now())
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  s      sessions;
  v_secs numeric;
  v_min  numeric;
  v_over numeric;
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
    v_over := v_secs - s.package_minutes * 60;
    -- inside the package, waived by staff, or inside the grace period and not marked "charge": just the package price
    if v_over <= 0
       or s.overtime_mode = 'waive'
       or (s.overtime_mode is null and v_over <= s.overtime_grace_min * 60) then
      return s.package_price;
    end if;
    return s.package_price + round(
      ceil(v_over / (s.block_min * 60.0)) * s.block_min * s.rate_per_hour / 60, 2);
  end if;

  v_min := greatest(ceil(v_secs / (s.block_min * 60.0)) * s.block_min, s.min_bill_min);
  return round(v_min * s.rate_per_hour / 60, 2);
end $$;

-- a new session remembers the grace period in force when it started
create or replace function start_session(p_station bigint, p_package bigint default null,
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
                          min_bill_min, overtime_grace_min, package_id, package_name, package_minutes, package_price)
    values (p_station, nullif(btrim(p_name), ''), nullif(btrim(p_phone), ''), st.rate_per_hour,
            cfg.billing_block_min, cfg.min_bill_min, cfg.overtime_grace_min, pk.id, pk.name, pk.minutes, pk.price)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Station already has an open session';
  end;
  return v_id;
end $$;

-- staff's choice for one open session: 'charge', 'waive', or null for automatic
create function set_overtime_mode(p_session bigint, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_mode is not null and p_mode not in ('charge', 'waive') then raise exception 'Choose charge, waive or automatic'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then raise exception 'The session is already billed or cancelled'; end if;
  if s.package_minutes is null then raise exception 'Overtime applies to package sessions only'; end if;
  update sessions set overtime_mode = p_mode where id = p_session;
end $$;

revoke execute on function set_overtime_mode(bigint, text) from public, anon;
grant  execute on function set_overtime_mode(bigint, text) to authenticated;
