-- 0015_customers_screen.sql : the staff Customers screen.
-- Staff can look a customer up, see their bookings, passes and bills, keep a private note and fix a name or
-- phone number. The note is staff-only: customers can read their own customer row, so the notes column is
-- taken out of what the signed-in role may select directly (staff read it through customer_detail).

alter table customers add column notes text;

revoke select on customers from authenticated;
grant select (id, profile_id, name, phone, email, created_at) on customers to authenticated;

-- ---------- list and search ----------
create function customer_list(p_search text default null)
returns table (id bigint, name text, phone text, email text, has_login boolean, last_booking timestamptz,
               bookings int, no_shows int, active_passes int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  s text := nullif(btrim(coalesce(p_search, '')), '');
  k text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.name, c.phone, c.email, c.profile_id is not null,
           (select max(b.start_at) from bookings b where b.customer_id = c.id),
           (select count(*)::int from bookings b where b.customer_id = c.id),
           (select count(*)::int from bookings b where b.customer_id = c.id and b.status = 'no_show'),
           (select count(*)::int from customer_passes cp
             where cp.customer_id = c.id and cp.status = 'active' and now() >= cp.starts_at and now() < cp.expires_at
               and (cp.kind = 'unlimited' or cp.minutes_total > cp.minutes_used))
      from customers c
     where s is null
        or position(lower(s) in lower(c.name)) > 0
        or position(lower(s) in lower(coalesce(c.email, ''))) > 0
        or (length(k) >= 3 and position(k in regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) > 0)
     order by 6 desc nulls last, c.name
     limit 200;
end $$;

-- ---------- one customer ----------
create function customer_detail(p_customer bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c        customers;
  v_bills  jsonb;
  v_spent  numeric;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into c from customers where id = p_customer;
  if not found then raise exception 'Customer not found'; end if;

  with bl as (
    select b.bill_no, b.created_at, b.total, b.status, 'booking'::text as kind
      from bills b join sessions s on s.id = b.session_id join bookings bk on bk.id = s.booking_id
     where bk.customer_id = c.id
    union all
    select b.bill_no, b.created_at, b.total, b.status, 'pass'
      from bills b join customer_passes cp on cp.bill_no = b.bill_no
     where cp.customer_id = c.id)
  select coalesce(jsonb_agg(to_jsonb(bl) order by bl.created_at desc), '[]'::jsonb),
         coalesce(sum(total) filter (where status = 'paid'), 0)
    into v_bills, v_spent from bl;

  return jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email,
                                   'has_login', c.profile_id is not null, 'notes', c.notes, 'created_at', c.created_at),
    'counts',   (select jsonb_build_object('bookings', count(*),
                                           'no_shows', count(*) filter (where status = 'no_show'),
                                           'cancelled', count(*) filter (where status = 'cancelled'),
                                           'attended', count(*) filter (where status in ('checked_in', 'completed')))
                   from bookings where customer_id = c.id),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'start_at', b.start_at, 'end_at', b.end_at,
                                   'station_type', b.station_type, 'slots', b.slots, 'status', b.status, 'channel', b.channel)
                                   order by b.start_at desc), '[]'::jsonb)
                   from (select * from bookings where customer_id = c.id order by start_at desc limit 50) b),
    'passes',   (select coalesce(jsonb_agg(jsonb_build_object('id', cp.id, 'name', cp.name, 'kind', cp.kind,
                                   'station_type', cp.station_type, 'minutes_total', cp.minutes_total,
                                   'minutes_used', cp.minutes_used, 'starts_at', cp.starts_at, 'expires_at', cp.expires_at,
                                   'status', cp.status, 'price', cp.price) order by cp.created_at desc), '[]'::jsonb)
                   from customer_passes cp where cp.customer_id = c.id),
    'bills',    v_bills,
    'spent',    v_spent);
end $$;

-- ---------- fix details, keep a note ----------
create function update_customer(p_id bigint, p_name text, p_phone text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c       customers;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  k       text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into c from customers where id = p_id for update;
  if not found then raise exception 'Customer not found'; end if;
  if v_name is null then raise exception 'Name is required'; end if;

  if c.profile_id is not null and (v_name is distinct from c.name or v_phone is distinct from nullif(btrim(coalesce(c.phone, '')), '')) then
    raise exception 'This customer signed in online and manages their own name and phone. You can edit the note only';
  end if;

  if v_phone is not null then
    if k !~ '^\d{7,15}$' then raise exception 'Enter a valid phone number (7 to 15 digits)'; end if;
    if c.profile_id is null and exists (
         select 1 from customers o
          where o.id <> p_id and o.profile_id is null and regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') = k) then
      raise exception 'Another customer already has that phone number';
    end if;
  end if;

  update customers set name = v_name, phone = v_phone, notes = nullif(btrim(coalesce(p_notes, '')), '') where id = p_id;
end $$;

revoke execute on function customer_list(text), customer_detail(bigint), update_customer(bigint, text, text, text) from public, anon;
grant execute on function customer_list(text), customer_detail(bigint), update_customer(bigint, text, text, text) to authenticated;
