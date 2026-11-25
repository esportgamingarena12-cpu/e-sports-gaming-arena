-- Phase 44 (security): lock an account for 15 minutes after 5 failed password logins.
-- The secure-login Edge Function is the only thing that uses this. It runs every password login through these functions:
--   login_locked(keys)             : how many seconds are left on a lock (0 = not locked)
--   login_failed(key, max, mins)   : count a failed attempt; lock for `mins` minutes when `max` failures happen within `mins` minutes
--   login_succeeded(key)           : a correct password clears that key's count (so the failures are "consecutive")
-- A key is 'acct:<sha256 of the lower-case email>' (the email itself is never stored) or 'ip:<address>'.
-- The table and the functions are for the server side only: no policy, and nothing is granted to the app's roles or visitors.
create table login_attempts (
  key          text primary key,
  failures     int         not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table login_attempts enable row level security;   -- no policies: only the server side reads it
revoke all on login_attempts from anon, authenticated;

create function login_locked(p_keys text[]) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(ceil(extract(epoch from (locked_until - now())))), 0)::int
    from login_attempts
   where key = any (p_keys) and locked_until is not null and locked_until > now()
$$;

create function login_failed(p_key text, p_max int, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare
  r login_attempts;
  n int;
begin
  if p_key is null or length(p_key) > 200 or p_max < 1 or p_minutes < 1 then raise exception 'Invalid request'; end if;
  insert into login_attempts (key) values (p_key) on conflict (key) do nothing;
  select * into r from login_attempts where key = p_key for update;
  if r.window_start < now() - make_interval(mins => p_minutes) then
    n := 1;                                   -- the old failures are too old to count: start again
    update login_attempts set failures = 1, window_start = now(), locked_until = null, updated_at = now() where key = p_key;
  else
    n := r.failures + 1;
    update login_attempts
       set failures = n,
           locked_until = case when n >= p_max then now() + make_interval(mins => p_minutes) else locked_until end,
           updated_at = now()
     where key = p_key;
  end if;
  -- tidy up: a day-old key is of no use any more
  delete from login_attempts where updated_at < now() - interval '1 day';
end $$;

create function login_succeeded(p_key text) returns void
language sql security definer set search_path = public as $$
  delete from login_attempts where key = p_key
$$;

revoke execute on function login_locked(text[]), login_failed(text, int, int), login_succeeded(text) from public, anon, authenticated;
grant  execute on function login_locked(text[]), login_failed(text, int, int), login_succeeded(text) to service_role;
