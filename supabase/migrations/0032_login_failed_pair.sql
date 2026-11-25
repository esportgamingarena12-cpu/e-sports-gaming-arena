-- Phase 44b: make the secure login faster.
-- A wrong password used to need two separate database calls (count it for the account, then for the address).
-- This does both in one call, so a login makes fewer network round trips. Same rules, same limits; server side only.
create function login_failed_pair(p_acct text, p_ip text, p_acct_max int, p_ip_max int, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform login_failed(p_acct, p_acct_max, p_minutes);
  perform login_failed(p_ip, p_ip_max, p_minutes);
end $$;

revoke execute on function login_failed_pair(text, text, int, int, int) from public, anon, authenticated;
grant  execute on function login_failed_pair(text, text, int, int, int) to service_role;
