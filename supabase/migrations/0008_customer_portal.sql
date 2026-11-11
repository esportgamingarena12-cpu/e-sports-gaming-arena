-- 0008_customer_portal.sql : what the customer pages need.
-- Customers cannot read stations, settings or bills, so these small functions give them exactly
-- their own data and the public booking facts, and nothing else.

-- ---------- shared availability logic (internal) ----------
create function availability_rows(p_station_type text, p_date date, p_slots int,
                                  p_staff boolean, p_ignore_booking bigint)
returns table (slot_start timestamptz, free int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  cfg     booking_settings;
  oh      opening_hours;
  v_type  text := lower(btrim(coalesce(p_station_type, '')));
  v_slots int  := greatest(coalesce(p_slots, 1), 1);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
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
                       where st.active and st.type = v_type and (st.online_bookable or coalesce(p_staff, false))
                         and station_free(st.id, s.start_ts,
                                          s.start_ts + make_interval(mins => v_slots * cfg.slot_minutes),
                                          p_ignore_booking))
           end
      from (select ((p_date + make_interval(mins => m))::timestamp at time zone 'Asia/Kolkata') as start_ts
              from generate_series(first_m, close_m - v_slots * cfg.slot_minutes, cfg.slot_minutes) m) s
     order by s.start_ts;
end $$;

revoke execute on function availability_rows(text, date, int, boolean, bigint) from public, anon, authenticated;

-- same behaviour as before, now built on the shared logic
create or replace function get_availability(p_station_type text, p_date date,
                                            p_slots int default 1, p_staff_view boolean default false)
returns table (slot_start timestamptz, free int)
language sql stable security definer set search_path = public as $$
  select * from availability_rows(p_station_type, p_date, p_slots, coalesce(p_staff_view, false) and is_staff(), null)
$$;

-- free times for moving one's own booking (the booking's current slot does not count against itself)
create function get_reschedule_availability(p_booking bigint, p_date date)
returns table (slot_start timestamptz, free int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  b      bookings;
  v_cust bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select * into b from bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if not is_staff() then
    select id into v_cust from customers where profile_id = auth.uid();
    if v_cust is null or b.customer_id <> v_cust then raise exception 'Booking not found'; end if;
  end if;
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking can be rescheduled'; end if;
  return query select * from availability_rows(b.station_type, p_date, b.slots, is_staff(), b.id);
end $$;

-- ---------- public booking facts ----------
create function booking_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_name',    (select shop_name from settings),
    'slot_minutes', bs.slot_minutes,
    'min_slots',    bs.min_slots,
    'max_slots',    bs.max_slots,
    'window_days',  bs.window_days,
    'cutoff_hours', bs.cutoff_hours,
    'types',        (select coalesce(jsonb_agg(t order by t), '[]'::jsonb)
                       from (select distinct type as t from stations where active and online_bookable) x))
    from booking_settings bs
$$;

-- ---------- the customer's own profile ----------
create function save_my_profile(p_name text, p_phone text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_role  user_role;
  v_email text;
  v_id    bigint;
  k       text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select role, email into v_role, v_email from profiles where id = auth.uid() and active;
  if not found then raise exception 'Account disabled – contact Admin' using errcode = '42501'; end if;
  if v_role <> 'customer' then raise exception 'Staff accounts book from the counter'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name is required'; end if;
  if k !~ '^\d{7,15}$' then raise exception 'Enter a valid phone number (7 to 15 digits)'; end if;

  -- a login always gets its own record: phone numbers are not verified, so it is never merged
  -- with a counter customer who happens to have the same number
  insert into customers (profile_id, name, phone, email)
  values (auth.uid(), btrim(p_name), btrim(p_phone), v_email)
  on conflict (profile_id) do update set name = excluded.name, phone = excluded.phone
  returning id into v_id;

  update profiles set full_name = btrim(p_name), phone = btrim(p_phone) where id = auth.uid();
  return v_id;
end $$;

-- ---------- the customer's own bills (bills of their checked-in bookings) ----------
create function my_bills()
returns table (bill_no bigint, booking_id bigint, created_at timestamptz, station_name text,
               subtotal numeric, discount numeric, total numeric, status text,
               items jsonb, payments jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  return query
    select b.bill_no, s.booking_id, b.created_at, st.name, b.subtotal, b.discount, b.total, b.status,
           coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'amount', i.amount) order by i.id)
                       from bill_items i where i.bill_no = b.bill_no), '[]'::jsonb),
           coalesce((select jsonb_agg(jsonb_build_object('mode', p.mode, 'amount', p.amount) order by p.id)
                       from payments p where p.bill_no = b.bill_no), '[]'::jsonb)
      from bills b
      join sessions s  on s.id = b.session_id
      join stations st on st.id = s.station_id
      join bookings bk on bk.id = s.booking_id
      join customers c on c.id = bk.customer_id
     where c.profile_id = auth.uid()
     order by b.created_at desc;
end $$;

-- ---------- privileges ----------
revoke execute on function
  get_reschedule_availability(bigint, date), booking_info(), save_my_profile(text, text), my_bills()
  from public, anon;
grant execute on function booking_info() to anon, authenticated;     -- public: what the booking page shows
grant execute on function
  get_reschedule_availability(bigint, date), save_my_profile(text, text), my_bills()
  to authenticated;
