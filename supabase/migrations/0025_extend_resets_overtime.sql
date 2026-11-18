-- Phase 36 (audit of the overtime and money code): extending a package session starts a fresh overtime decision.
-- Before, a staff choice made earlier (Don't charge, or a typed amount) stayed on the session after Extend and would
-- have applied to the overtime of the new, longer time without anyone choosing it again.
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
           package_price   = package_price + pk.price,
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
