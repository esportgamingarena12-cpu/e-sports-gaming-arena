-- One-time clean-up before going live (2026-11-19). NOT a migration: it is run once by hand.
-- Deletes the test activity from BEFORE today (India time) and keeps today's records.
--   deleted : bills, bill lines, payments, sessions, canteen tabs, session end-time log, bookings (and their emails) that started before today
--   kept    : every login/account (profiles), customers, stations, packages, pass types, products and their stock counts,
--             stock history (only its link to a deleted bill is cleared), games, settings, opening hours, booking rules,
--             and everything dated today or later
-- Bill numbers restart at 1 only when no bill is left.
-- Everything happens in one transaction: if anything fails, nothing is deleted.

begin;

-- the boundary: the start of today, India time
create temp table _cut on commit drop as select timestamptz '2026-11-19 00:00:00+05:30' as at;

-- bills made before today, and the sessions that belong only to them
create temp table _old_bills on commit drop as
  select bill_no from bills where created_at < (select at from _cut);

create temp table _old_sessions on commit drop as
  select id from sessions
   where started_at < (select at from _cut)
     and id not in (select session_id from bills where session_id is not null and created_at >= (select at from _cut));

delete from payments   where bill_no in (select bill_no from _old_bills);
delete from bill_items where bill_no in (select bill_no from _old_bills);
update stock_moves     set bill_no = null where bill_no in (select bill_no from _old_bills);
update customer_passes set bill_no = null where bill_no in (select bill_no from _old_bills);
delete from bills      where bill_no in (select bill_no from _old_bills);

delete from session_end_log where session_id in (select id from _old_sessions);
delete from tab_items       where session_id in (select id from _old_sessions);
delete from sessions        where id in (select id from _old_sessions);

-- bookings that started before today and that no remaining session points to (their queued emails go with them)
delete from bookings
 where start_at < (select at from _cut)
   and id not in (select booking_id from sessions where booking_id is not null);

-- first real bill becomes #1 (only if no bill is left)
do $$
begin
  if not exists (select 1 from bills) then
    alter table bills alter column bill_no restart with 1;
  end if;
end $$;

commit;
