-- 0004_booking_settings.sql : booking rules (single row) and opening hours per weekday.
-- Used by the Phase 7 booking functions. weekday: 0 = Sunday ... 6 = Saturday.

create table booking_settings (
  id            boolean primary key default true check (id),
  slot_minutes  int not null default 30 check (slot_minutes in (15, 30, 60)),
  window_days   int not null default 7  check (window_days between 1 and 60),
  min_slots     int not null default 1  check (min_slots >= 1),
  max_slots     int not null default 8  check (max_slots >= 1),
  cutoff_hours  int not null default 2  check (cutoff_hours >= 0),
  grace_minutes int not null default 15 check (grace_minutes >= 0),
  updated_at    timestamptz not null default now(),
  check (max_slots >= min_slots)
);
insert into booking_settings default values;

create table opening_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  open_time  time not null default '10:00',
  close_time time not null default '22:00',
  closed     boolean not null default false,
  check (closed or open_time < close_time)
);
insert into opening_hours (weekday) select generate_series(0, 6);

revoke all on booking_settings, opening_hours from anon, authenticated;
grant select on booking_settings, opening_hours to authenticated;
grant update (slot_minutes, window_days, min_slots, max_slots, cutoff_hours, grace_minutes, updated_at)
  on booking_settings to authenticated;
grant update (open_time, close_time, closed) on opening_hours to authenticated;

alter table booking_settings enable row level security;
alter table opening_hours    enable row level security;

create policy booking_settings_select on booking_settings for select to authenticated using (is_staff());
create policy booking_settings_update on booking_settings for update to authenticated
  using (is_admin()) with check (is_admin());
create policy opening_hours_select on opening_hours for select to authenticated using (is_staff());
create policy opening_hours_update on opening_hours for update to authenticated
  using (is_admin()) with check (is_admin());
