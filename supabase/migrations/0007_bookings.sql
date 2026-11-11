-- 0007_bookings.sql : customers, bookings, no-double-booking rule, availability and booking
-- functions, check-in, no-show job. All slot times are Asia/Kolkata (decision D13).
-- Bookings change ONLY through the functions below.

create extension if not exists btree_gist with schema extensions;

create type booking_status as enum ('confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');
create type booking_channel as enum ('online', 'counter', 'phone');

-- ---------- tables ----------
create table customers (
  id         bigint generated always as identity primary key,
  profile_id uuid unique references profiles (id) on delete set null,   -- null = counter / phone customer
  name       text not null check (length(btrim(name)) > 0),
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);
create index customers_phone_idx on customers ((regexp_replace(coalesce(phone, ''), '\D', '', 'g')));

create table bookings (
  id           bigint generated always as identity primary key,
  customer_id  bigint not null references customers (id),
  station_type text   not null,
  station_id   bigint not null references stations (id),
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  slots        int    not null check (slots >= 1),
  status       booking_status  not null default 'confirmed',
  channel      booking_channel not null,
  notes        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  check (end_at > start_at),
  -- one active booking per station per time window (FR-31)
  constraint bookings_no_overlap exclude using gist (
    station_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('confirmed', 'checked_in'))
);
create index bookings_start_idx on bookings (start_at);
create index bookings_customer_idx on bookings (customer_id);

-- a session started by check-in remembers its booking
alter table sessions add column booking_id bigint references bookings (id);
create unique index sessions_one_per_booking on sessions (booking_id) where booking_id is not null;

-- ---------- internal helpers (not callable from the app) ----------

-- When the station's open session is expected to end, as far as bookings are concerned.
-- A per-hour session has no end, so it blocks only the current slot; a package session until its package ends.
create function station_busy_until(p_station bigint) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  s          sessions;
  cfg        booking_settings;
  local_now  timestamp := now() at time zone 'Asia/Kolkata';
  slot_end   timestamptz;
begin
  select * into s from sessions
   where station_id = p_station and status in ('running', 'paused', 'ended') limit 1;
  if not found then return null; end if;
  select * into cfg from booking_settings;
  slot_end := (date_trunc('day', local_now)
               + (floor(extract(epoch from (local_now - date_trunc('day', local_now))) / (cfg.slot_minutes * 60))::int + 1)
                 * make_interval(mins => cfg.slot_minutes)) at time zone 'Asia/Kolkata';
  if s.package_minutes is not null then
    return greatest(slot_end, s.started_at + make_interval(mins => s.package_minutes)
                                           + make_interval(secs => s.paused_seconds));
  end if;
  return slot_end;
end $$;

-- Is the station free for [p_start, p_end)? A confirmed booking past start + grace no longer blocks.
create function station_free(p_station bigint, p_start timestamptz, p_end timestamptz,
                             p_ignore_booking bigint default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  g    int;
  busy timestamptz;
begin
  select grace_minutes into g from booking_settings;
  if exists (
    select 1 from bookings b
     where b.station_id = p_station
       and b.id is distinct from p_ignore_booking
       and (b.status = 'checked_in'
            or (b.status = 'confirmed' and b.start_at + make_interval(mins => g) >= now()))
       and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    return false;
  end if;
  busy := station_busy_until(p_station);
  if busy is not null and p_start < busy then return false; end if;
  return true;
end $$;

-- Booking rules: length, slot boundary, future, window, opening hours. Returns the end time.
create function check_booking_window(p_start timestamptz, p_slots int) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  cfg         booking_settings;
  oh          opening_hours;
  local_start timestamp := p_start at time zone 'Asia/Kolkata';
  local_end   timestamp;
  v_end       timestamptz;
  start_date  date := (p_start at time zone 'Asia/Kolkata')::date;
  today       date := (now() at time zone 'Asia/Kolkata')::date;
  mins        int;
begin
  select * into cfg from booking_settings;
  if p_slots is null or p_slots < cfg.min_slots or p_slots > cfg.max_slots then
    raise exception 'Booking length must be between % and % slots', cfg.min_slots, cfg.max_slots;
  end if;
  mins := extract(hour from local_start)::int * 60 + extract(minute from local_start)::int;
  if extract(second from local_start) <> 0 or mins % cfg.slot_minutes <> 0 then
    raise exception 'Start time must be on a % minute boundary', cfg.slot_minutes;
  end if;
  if p_start <= now() then raise exception 'That time has already passed'; end if;
  if start_date > today + cfg.window_days then
    raise exception 'Bookings open up to % days ahead', cfg.window_days;
  end if;
  select * into oh from opening_hours where weekday = extract(dow from start_date)::int;
  if not found or oh.closed then raise exception 'We are closed on that day'; end if;
  v_end := p_start + make_interval(mins => p_slots * cfg.slot_minutes);
  local_end := v_end at time zone 'Asia/Kolkata';
  if local_start::time < oh.open_time or local_end::date <> start_date or local_end::time > oh.close_time then
    raise exception 'Outside opening hours (% to %)', to_char(oh.open_time, 'HH24:MI'), to_char(oh.close_time, 'HH24:MI');
  end if;
  return v_end;
end $$;

-- Find or create the counter / phone customer for a phone number (de-duplicated by digits).
create function resolve_customer(p_name text, p_phone text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  k    text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id bigint;
begin
  if k !~ '^\d{7,15}$' then raise exception 'Enter a valid phone number (7 to 15 digits)'; end if;
  select id into v_id from customers
   where profile_id is null and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = k
   order by id limit 1;
  if found then return v_id; end if;
  insert into customers (name, phone) values (btrim(p_name), btrim(p_phone)) returning id into v_id;
  return v_id;
end $$;

-- Confirmed bookings that were not checked in within the grace period become no-shows.
create function release_no_shows() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  g int;
begin
  select grace_minutes into g from booking_settings;
  update bookings set status = 'no_show'
   where status = 'confirmed' and start_at + make_interval(mins => g) < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- availability (public: free counts only, no customer data) ----------
create function get_availability(p_station_type text, p_date date,
                                 p_slots int default 1, p_staff_view boolean default false)
returns table (slot_start timestamptz, free int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  cfg     booking_settings;
  oh      opening_hours;
  v_type  text    := lower(btrim(coalesce(p_station_type, '')));
  v_slots int     := greatest(coalesce(p_slots, 1), 1);
  v_staff boolean := coalesce(p_staff_view, false) and is_staff();
  v_today date    := (now() at time zone 'Asia/Kolkata')::date;
  open_m  int;
  close_m int;
  first_m int;
begin
  select * into cfg from booking_settings;
  if p_date is null or p_date < v_today or p_date > v_today + cfg.window_days then return; end if;
  select * into oh from opening_hours where weekday = extract(dow from p_date)::int;
  if not found or oh.closed then return; end if;
  open_m  := extract(hour from oh.open_time)::int  * 60 + extract(minute from oh.open_time)::int;
  close_m := extract(hour from oh.close_time)::int * 60 + extract(minute from oh.close_time)::int;
  first_m := (ceil(open_m::numeric / cfg.slot_minutes) * cfg.slot_minutes)::int;

  return query
    select s.start_ts,
           case when s.start_ts <= now() then 0
                else (select count(*)::int
                        from stations st
                       where st.active and st.type = v_type and (st.online_bookable or v_staff)
                         and station_free(st.id, s.start_ts, s.start_ts + make_interval(mins => v_slots * cfg.slot_minutes)))
           end
      from (select ((p_date + make_interval(mins => m))::timestamp at time zone 'Asia/Kolkata') as start_ts
              from generate_series(first_m, close_m - v_slots * cfg.slot_minutes, cfg.slot_minutes) m) s
     order by s.start_ts;
end $$;

-- ---------- create ----------
-- Customers get an online-bookable station of the type, assigned automatically (D5).
-- Staff (on behalf of a customer) may use any active station of the type and may pick one.
create function create_booking(p_station_type text, p_start timestamptz, p_slots int,
                               p_name text default null, p_phone text default null,
                               p_channel booking_channel default 'counter',
                               p_station bigint default null, p_notes text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_staff   boolean := is_staff();
  v_type    text := lower(btrim(coalesce(p_station_type, '')));
  v_cust    bigint;
  v_channel booking_channel;
  v_end     timestamptz;
  v_id      bigint;
  st        record;
begin
  if auth.uid() is null then raise exception 'Please sign in to book' using errcode = '42501'; end if;
  if v_type = '' or not exists (select 1 from stations where active and type = v_type) then
    raise exception 'Unknown station type';
  end if;

  if v_staff then
    if coalesce(btrim(p_name), '') = '' then raise exception 'Customer name is required'; end if;
    v_cust := resolve_customer(p_name, p_phone);
    v_channel := case when p_channel = 'phone' then 'phone' else 'counter' end;
    if p_station is not null
       and not exists (select 1 from stations where id = p_station and active and type = v_type) then
      raise exception 'That station is not available for this station type';
    end if;
  else
    if not exists (select 1 from profiles where id = auth.uid() and active) then
      raise exception 'Account disabled – contact Admin' using errcode = '42501';
    end if;
    select id into v_cust from customers where profile_id = auth.uid();
    if v_cust is null then raise exception 'Please complete your profile (name and phone) first'; end if;
    if p_station is not null then raise exception 'Customers cannot pick a specific station'; end if;
    v_channel := 'online';
  end if;

  perform release_no_shows();
  v_end := check_booking_window(p_start, p_slots);

  for st in
    select id from stations
     where active and type = v_type and (v_staff or online_bookable) and (p_station is null or id = p_station)
     order by sort_order, id
  loop
    continue when not station_free(st.id, p_start, v_end);
    begin
      insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, channel, notes)
      values (v_cust, v_type, st.id, p_start, v_end, p_slots, v_channel, nullif(btrim(coalesce(p_notes, '')), ''))
      returning id into v_id;
      return v_id;
    exception when exclusion_violation then
      continue; -- someone else took this station a moment ago: try the next one
    end;
  end loop;

  raise exception 'Slot just taken: no station is free for that time';
end $$;

-- ---------- cancel ----------
create function cancel_booking(p_booking bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  b      bookings;
  cfg    booking_settings;
  v_cust bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;

  if not is_staff() then
    select id into v_cust from customers where profile_id = auth.uid();
    if v_cust is null or b.customer_id <> v_cust then raise exception 'Booking not found'; end if;
    select * into cfg from booking_settings;
    if now() > b.start_at - make_interval(hours => cfg.cutoff_hours) then
      raise exception 'Too late to cancel online: please call the counter';
    end if;
  end if;
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking can be cancelled'; end if;

  update bookings set status = 'cancelled', cancelled_at = now() where id = p_booking;
end $$;

-- ---------- reschedule ----------
create function reschedule_booking(p_booking bigint, p_start timestamptz, p_slots int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  b       bookings;
  cfg     booking_settings;
  v_staff boolean := is_staff();
  v_cust  bigint;
  v_slots int;
  v_end   timestamptz;
  st      record;
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;

  if not v_staff then
    select id into v_cust from customers where profile_id = auth.uid();
    if v_cust is null or b.customer_id <> v_cust then raise exception 'Booking not found'; end if;
    select * into cfg from booking_settings;
    if now() > b.start_at - make_interval(hours => cfg.cutoff_hours) then
      raise exception 'Too late to change online: please call the counter';
    end if;
  end if;
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking can be rescheduled'; end if;

  v_slots := coalesce(p_slots, b.slots);
  perform release_no_shows();
  v_end := check_booking_window(p_start, v_slots);

  -- keep the same station if it is free, otherwise any other station of the type
  for st in
    select id from stations
     where active and type = b.station_type and (v_staff or online_bookable or id = b.station_id)
     order by (id = b.station_id) desc, sort_order, id
  loop
    continue when not station_free(st.id, p_start, v_end, p_booking);
    begin
      update bookings set station_id = st.id, start_at = p_start, end_at = v_end, slots = v_slots
       where id = p_booking;
      return;
    exception when exclusion_violation then
      continue;
    end;
  end loop;

  raise exception 'Slot just taken: no station is free for that time';
end $$;

-- ---------- check in / no-show (staff) ----------
create function check_in_booking(p_booking bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  b         bookings;
  c         customers;
  v_session bigint;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform release_no_shows();
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status = 'no_show' then raise exception 'This booking was released as a no-show'; end if;
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking can be checked in'; end if;
  if now() < b.start_at - interval '15 minutes' then
    raise exception 'Too early to check in (from 15 minutes before the start)';
  end if;
  if now() >= b.end_at then raise exception 'This booking has already ended'; end if;

  select * into c from customers where id = b.customer_id;
  begin
    v_session := start_session(b.station_id, null, c.name, c.phone);
  exception when others then
    if sqlerrm = 'Station already has an open session' then
      raise exception 'The station still has an open session. Finish it first.';
    end if;
    raise;
  end;

  update sessions set booking_id = p_booking where id = v_session;
  update bookings set status = 'checked_in' where id = p_booking;
  return v_session;
end $$;

create function mark_no_show(p_booking bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking can be marked as a no-show'; end if;
  if now() < b.start_at then raise exception 'Too early to mark a no-show'; end if;
  update bookings set status = 'no_show' where id = p_booking;
end $$;

-- ---------- keep the booking in step with its session ----------
create function sync_booking_with_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.booking_id is not null and new.status in ('billed', 'cancelled')
     and old.status is distinct from new.status then
    update bookings
       set status = case new.status when 'billed' then 'completed'::booking_status else 'cancelled'::booking_status end,
           cancelled_at = case when new.status = 'cancelled' then now() else cancelled_at end
     where id = new.booking_id and status = 'checked_in';
  end if;
  return new;
end $$;

create trigger sessions_sync_booking
  after update of status on sessions
  for each row execute function sync_booking_with_session();

-- ---------- privileges + RLS ----------
revoke all on customers, bookings from anon, authenticated;
grant select on customers, bookings to authenticated;

alter table customers enable row level security;
alter table bookings  enable row level security;

create policy customers_select on customers for select to authenticated
  using (is_staff() or profile_id = auth.uid());
create policy bookings_select on bookings for select to authenticated
  using (is_staff() or customer_id in (select id from customers where profile_id = auth.uid()));

-- internal helpers: only other functions use them
revoke execute on function
  station_busy_until(bigint), station_free(bigint, timestamptz, timestamptz, bigint),
  check_booking_window(timestamptz, int), resolve_customer(text, text), release_no_shows(),
  sync_booking_with_session()
  from public, anon, authenticated;

-- callable functions
revoke execute on function
  get_availability(text, date, int, boolean),
  create_booking(text, timestamptz, int, text, text, booking_channel, bigint, text),
  cancel_booking(bigint), reschedule_booking(bigint, timestamptz, int),
  check_in_booking(bigint), mark_no_show(bigint)
  from public, anon;
grant execute on function get_availability(text, date, int, boolean) to anon, authenticated;   -- public availability
grant execute on function
  create_booking(text, timestamptz, int, text, text, booking_channel, bigint, text),
  cancel_booking(bigint), reschedule_booking(bigint, timestamptz, int),
  check_in_booking(bigint), mark_no_show(bigint)
  to authenticated;

-- ---------- live sync ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table bookings;
  end if;
end $$;

-- ---------- no-show job: every 5 minutes ----------
do $$ begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron could not be enabled here (%). Enable it under Database > Extensions, then run the cron.schedule call again.', sqlerrm;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('release-no-shows', '*/5 * * * *', 'select public.release_no_shows()');
  end if;
end $$;
