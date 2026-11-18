-- Phase 38: undo a Stop that was pressed by mistake. The session carries on as if it had never been stopped: the time
-- between the Stop and now counts as played (the customer never left). The change is written to the same audit log as
-- the end-time corrections, so the Bills screen shows it. (reopen_session, which does not count that gap, is for a
-- customer who really left and came back; the counter no longer offers it.)
create function undo_stop_session(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status <> 'ended' then raise exception 'Only a stopped session that has not been billed can be resumed'; end if;

  -- paused_seconds is left alone, so the time since the Stop is counted as played
  update sessions set status = 'running', ended_at = null where id = p_session;

  insert into session_end_log (session_id, from_end, to_end, reason)
  values (p_session, s.ended_at, now(), 'Stop undone (the session was resumed)');
end $$;

revoke execute on function undo_stop_session(bigint) from public, anon;
grant  execute on function undo_stop_session(bigint) to authenticated;
