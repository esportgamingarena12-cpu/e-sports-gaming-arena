-- Phase 37: "customer left earlier". A session nobody stopped is billed up to the moment staff press Bill. Staff can now set
-- the real end time (never before the start, never in the future), with a required reason. Every change is written to
-- session_end_log, which nobody can edit or delete from the app; the Bills screen shows it next to the bill.
create table session_end_log (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references sessions (id),
  changed_by  uuid default auth.uid() references profiles (id),
  changed_at  timestamptz not null default now(),
  from_end    timestamptz not null,   -- when the session would have ended without the correction (now, or the earlier end)
  to_end      timestamptz not null,   -- the corrected end time
  reason      text not null check (char_length(btrim(reason)) between 3 and 200)
);
create index session_end_log_session_idx on session_end_log (session_id, changed_at);

alter table session_end_log enable row level security;
revoke all on session_end_log from anon, authenticated;
grant select on session_end_log to authenticated;
create policy session_end_log_select on session_end_log for select to authenticated using (is_staff());

create function set_session_end_time(p_session bigint, p_end timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s        sessions;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_from   timestamptz;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if char_length(v_reason) < 3 then raise exception 'Give a short reason (at least 3 characters)'; end if;
  if char_length(v_reason) > 200 then raise exception 'The reason is too long (200 characters at most)'; end if;
  if p_end is null then raise exception 'Choose the end time'; end if;

  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('running', 'paused', 'ended') then raise exception 'The session is already billed or cancelled'; end if;
  if p_end > now() then raise exception 'The end time cannot be in the future'; end if;
  -- the customer must have played for some time: after the start plus any time that was not counted
  if p_end <= s.started_at + (s.paused_seconds * interval '1 second') then
    raise exception 'The end time must be after the session started';
  end if;

  v_from := case when s.status = 'ended' then s.ended_at else now() end;

  update sessions
     set status = 'ended',
         ended_at = p_end,
         -- a session left paused: the time from the pause up to the new end is not played time either
         paused_seconds = paused_seconds
           + case when paused_at is not null then greatest(0, extract(epoch from (p_end - paused_at)))::int else 0 end,
         paused_at = null
   where id = p_session;

  insert into session_end_log (session_id, from_end, to_end, reason) values (p_session, v_from, p_end, v_reason);
end $$;

revoke execute on function set_session_end_time(bigint, timestamptz, text) from public, anon;
grant  execute on function set_session_end_time(bigint, timestamptz, text) to authenticated;
