-- 0005_server_time.sql : the server's clock, so counters on different devices
-- show the same running time and charge even if their own clocks differ.

create function server_now() returns timestamptz
language sql volatile as $$ select clock_timestamp() $$;

revoke execute on function server_now() from public, anon;
grant  execute on function server_now() to authenticated;
