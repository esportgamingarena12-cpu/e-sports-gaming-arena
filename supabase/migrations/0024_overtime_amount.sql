-- Phase 35: staff can charge a custom amount for overtime that is within the grace period.
--   sessions.overtime_amount: the amount typed by staff (rupees). It is used only when overtime_mode = 'charge' and the
--   overtime is still within the grace period; beyond the grace the normal block charge applies, so a long overtime
--   is never undercharged by a small custom amount.
-- session_charge() is mirrored in web/src/app/core/pricing.ts: change both together.
alter table sessions add column overtime_amount numeric(10,2) check (overtime_amount >= 0 and overtime_amount <= 100000);

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
    -- charged by staff within the grace with an amount they typed: that amount
    if s.overtime_mode = 'charge' and s.overtime_amount is not null and v_over <= s.overtime_grace_min * 60 then
      return s.package_price + s.overtime_amount;
    end if;
    return s.package_price + round(
      ceil(v_over / (s.block_min * 60.0)) * s.block_min * s.rate_per_hour / 60, 2);
  end if;

  v_min := greatest(ceil(v_secs / (s.block_min * 60.0)) * s.block_min, s.min_bill_min);
  return round(v_min * s.rate_per_hour / 60, 2);
end $$;

-- staff's choice for one open session: 'charge' (optionally with an amount), 'waive', or null for automatic
drop function set_overtime_mode(bigint, text);
create function set_overtime_mode(p_session bigint, p_mode text, p_amount numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_mode is not null and p_mode not in ('charge', 'waive') then raise exception 'Choose charge, waive or automatic'; end if;
  if p_amount is not null and (p_mode is distinct from 'charge') then raise exception 'An amount can only be given when charging overtime'; end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 100000) then raise exception 'The amount must be between 0 and 100000'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then raise exception 'The session is already billed or cancelled'; end if;
  if s.package_minutes is null then raise exception 'Overtime applies to package sessions only'; end if;
  update sessions set overtime_mode = p_mode, overtime_amount = round(p_amount, 2) where id = p_session;
end $$;

revoke execute on function set_overtime_mode(bigint, text, numeric) from public, anon;
grant  execute on function set_overtime_mode(bigint, text, numeric) to authenticated;
