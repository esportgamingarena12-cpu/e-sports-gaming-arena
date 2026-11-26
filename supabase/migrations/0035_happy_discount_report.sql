-- Phase 47: "Happy hour discount given" in the sales reports.
--   * A session started in a happy hour now also remembers the LIST prices (before the discount): list_rate_per_hour and
--     list_package_price. Sessions without a discount leave them empty. (No session has a discount yet, so nothing needs filling in.)
--   * session_list_charge() is session_charge() worked out with the list prices. The discount given on a paid bill is
--     list charge minus what was charged, so it is exact (staff-typed overtime amounts are not discounted and cancel out).
--   * The report functions get two more numbers, happy_sessions and happy_discount, without touching their old code:
--     report_core is renamed report_core_base and a small wrapper with the old name adds the two numbers. sales_report,
--     today_report and dashboard_today call report_core by name, so they all show it.
--   * Only PAID bills count (a void bill gives nothing back), by the day the bill was created, like the other sales figures.
--   * session_charge() and pricing.ts are NOT changed.

alter table sessions
  add column list_rate_per_hour  numeric(10,2) check (list_rate_per_hour  >= 0),
  add column list_package_price  numeric(10,2) check (list_package_price  >= 0);

-- ---------- starting a session: same as migration 0034, plus the list prices ----------
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
                          happy_pct, happy_name, list_rate_per_hour, list_package_price)
    values (p_station, nullif(btrim(p_name), ''), nullif(btrim(p_phone), ''),
            round(st.rate_per_hour * (100 - v_pct) / 100.0, 2),
            cfg.billing_block_min, cfg.min_bill_min, cfg.overtime_grace_min, pk.id, pk.name, pk.minutes,
            case when pk.id is null then null else round(pk.price * (100 - v_pct) / 100.0, 2) end,
            v_pct, v_hname,
            case when v_pct > 0 then st.rate_per_hour end,
            case when v_pct > 0 and pk.id is not null then pk.price end)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Station already has an open session';
  end;
  return v_id;
end $$;

-- ---------- extending a package session: same as migration 0034, plus the list price of the package that is added ----------
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
           list_package_price = case when s.happy_pct > 0 then coalesce(s.list_package_price, s.package_price) + pk.price end,
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

-- ---------- what the session would have cost at the list prices ----------
-- Exactly session_charge() (migration 0024) with the list rate and the list package price in place of the saved ones.
create function session_list_charge(p_session bigint, p_end timestamptz default now())
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  s      sessions;
  v_rate numeric;
  v_pkg  numeric;
  v_secs numeric;
  v_min  numeric;
  v_over numeric;
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Session not found'; end if;
  v_rate := coalesce(s.list_rate_per_hour, s.rate_per_hour);
  v_pkg  := coalesce(s.list_package_price, s.package_price);

  v_secs := extract(epoch from (p_end - s.started_at)) - s.paused_seconds
            - case when s.paused_at is not null
                   then extract(epoch from (p_end - s.paused_at)) else 0 end;
  v_secs := greatest(0, v_secs);

  if s.pass_id is not null then
    if s.pass_minutes_left is null then return 0; end if;
    v_min := ceil(v_secs / (s.block_min * 60.0)) * s.block_min;
    return round(greatest(0, v_min - s.pass_minutes_left) * v_rate / 60, 2);
  end if;

  if s.package_minutes is not null then
    v_over := v_secs - s.package_minutes * 60;
    if v_over <= 0
       or s.overtime_mode = 'waive'
       or (s.overtime_mode is null and v_over <= s.overtime_grace_min * 60) then
      return v_pkg;
    end if;
    if s.overtime_mode = 'charge' and s.overtime_amount is not null and v_over <= s.overtime_grace_min * 60 then
      return v_pkg + s.overtime_amount;
    end if;
    return v_pkg + round(ceil(v_over / (s.block_min * 60.0)) * s.block_min * v_rate / 60, 2);
  end if;

  v_min := greatest(ceil(v_secs / (s.block_min * 60.0)) * s.block_min, s.min_bill_min);
  return round(v_min * v_rate / 60, 2);
end $$;

revoke execute on function session_list_charge(bigint, timestamptz) from public, anon, authenticated;

-- ---------- the two numbers for the reports ----------
create function happy_discount_core(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'happy_sessions', count(*),
    'happy_discount', coalesce(sum(greatest(0, session_list_charge(s.id, coalesce(s.ended_at, b.created_at)) - b.gaming_charge)), 0))
    from bills b join sessions s on s.id = b.session_id
   where b.status = 'paid'
     and s.happy_pct > 0
     and b.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
     and b.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
$$;

revoke execute on function happy_discount_core(date, date) from public, anon, authenticated;

-- the old report body keeps working unchanged; the wrapper with the old name adds the two numbers
alter function report_core(date, date) rename to report_core_base;
create function report_core(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select report_core_base(p_from, p_to) || happy_discount_core(p_from, p_to)
$$;
revoke execute on function report_core(date, date) from public, anon, authenticated;
revoke execute on function report_core_base(date, date) from public, anon, authenticated;
