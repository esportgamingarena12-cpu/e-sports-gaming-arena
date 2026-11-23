-- Phase 43: privacy and data rights (India's DPDP Act).
--   legal details   : who runs the shop and who handles privacy complaints (Admin edits them in Settings); shown on the public pages
--   consent record  : which version of the Terms and Privacy Policy a customer agreed to, and when
--   data download   : export_my_data() gives a customer everything the app holds about them
--   delete account  : delete_my_account() removes the login and wipes the customer's name, phone and email.
--                     Bookings, sessions, bills, payments, stock and passes are KEPT unchanged (without the person's identity)
--                     so revenue, profit and every count stay exactly the same. Nothing here changes money, stock or sessions.

-- ---------- legal details (Admin, in Settings) ----------
alter table settings
  add column legal_name       text,
  add column grievance_name   text,
  add column grievance_email  text,
  add column grievance_phone  text,
  add column refund_days      int not null default 7 check (refund_days between 1 and 60),
  add column record_years     int not null default 8 check (record_years between 1 and 15);

grant update (legal_name, grievance_name, grievance_email, grievance_phone, refund_days, record_years) on settings to authenticated;

-- the public pages (Terms, Privacy, Refunds, Contact) read this: it holds only what a shop prints on its own door
create function legal_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_name',       s.shop_name,
    'legal_name',      s.legal_name,
    'address',         s.address,
    'phone',           s.phone,
    'gstin',           s.gstin,
    'grievance_name',  s.grievance_name,
    'grievance_email', s.grievance_email,
    'grievance_phone', s.grievance_phone,
    'refund_days',     s.refund_days,
    'record_years',    s.record_years,
    'cutoff_hours',    (select cutoff_hours from booking_settings limit 1))
    from settings s
$$;

-- ---------- consent record ----------
alter table profiles
  add column consent_version text,
  add column consented_at    timestamptz;

create function record_consent(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid version'; end if;
  update profiles set consent_version = p_version, consented_at = now() where id = auth.uid() and active;
  if not found then raise exception 'Account disabled – contact Admin' using errcode = '42501'; end if;
end $$;

-- ---------- download my data ----------
create function export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cust bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select id into v_cust from customers where profile_id = auth.uid();
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', email, 'name', full_name, 'phone', phone, 'role', role,
                                          'created_at', created_at, 'agreed_to_version', consent_version, 'agreed_at', consented_at)
                  from profiles where id = auth.uid()),
    'customer_record', (select jsonb_build_object('name', name, 'phone', phone, 'email', email, 'created_at', created_at)
                          from customers where id = v_cust),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'station_type', b.station_type, 'start_at', b.start_at,
                                                              'end_at', b.end_at, 'slots', b.slots, 'status', b.status,
                                                              'channel', b.channel, 'notes', b.notes, 'created_at', b.created_at)
                                           order by b.start_at desc)
                            from bookings b where b.customer_id = v_cust), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('name', cp.name, 'kind', cp.kind, 'price', cp.price,
                                                            'minutes_total', cp.minutes_total, 'minutes_used', cp.minutes_used,
                                                            'starts_at', cp.starts_at, 'expires_at', cp.expires_at, 'status', cp.status)
                                         order by cp.id desc)
                          from customer_passes cp where cp.customer_id = v_cust), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(to_jsonb(x)) from my_bills() x), '[]'::jsonb)
  );
end $$;

-- ---------- delete my account ----------
-- Customers only (staff and admin logins are removed by the Admin).
-- It must not change anything the shop counts: no booking, session, bill, payment, stock move or pass is changed in amount,
-- status or number. It only takes the PERSON out of the records (name, phone, email, notes, login).
--   refused while : a session is running or not yet billed, or a booking is still upcoming (confirmed or checked in).
--                   The customer finishes or cancels those first, so no current booking is touched.
--   walk-ins      : counter customers without a login, and their sessions, are never touched (nothing is matched by phone number).
--   passes        : left exactly as they are (no status or amount change). An active pass cannot be used afterwards because the
--                   customer record no longer has a name or phone, so the customer must give it up on purpose:
--                   the answer 'PB001' tells the screen to ask.
create function delete_my_account(p_forfeit_passes boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_cust bigint;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select role into v_role from profiles where id = v_uid;
  if not found then raise exception 'Account not found'; end if;
  if v_role <> 'customer' then raise exception 'Staff and admin logins are removed by the Admin' using errcode = '42501'; end if;

  select id into v_cust from customers where profile_id = v_uid;

  if v_cust is not null then
    if exists (select 1 from sessions s join bookings b on b.id = s.booking_id
                where b.customer_id = v_cust and s.status in ('running', 'paused', 'ended')) then
      raise exception 'You have a session in progress or a bill still to pay. Please finish it at the counter first.';
    end if;
    if exists (select 1 from bookings where customer_id = v_cust and status in ('confirmed', 'checked_in')) then
      raise exception 'You have an upcoming booking. Please cancel it (or wait until it is done), then delete your account.';
    end if;
    if not p_forfeit_passes and exists (select 1 from customer_passes
                                         where customer_id = v_cust and status = 'active' and expires_at > now()
                                           and (kind = 'unlimited' or minutes_total > minutes_used)) then
      raise exception 'You still have an active pass. After you delete your account it cannot be used and is not refunded.' using errcode = 'PB001';
    end if;

    -- take the person out of their own records; amounts, statuses and counts stay exactly as they were
    delete from booking_emails where booking_id in (select id from bookings where customer_id = v_cust);
    update bills set customer_name = null
     where session_id in (select s.id from sessions s join bookings b on b.id = s.booking_id where b.customer_id = v_cust);
    update sessions set customer_name = null, customer_phone = null
     where booking_id in (select id from bookings where customer_id = v_cust);
    update bookings set notes = null, created_by = null where customer_id = v_cust or created_by = v_uid;

    -- the customer record stays (bookings, bills and passes point at it) but no longer says who it was
    update customers set name = 'Deleted customer', phone = null, email = null, profile_id = null where id = v_cust;
  end if;

  -- the login itself (the profile goes with it)
  delete from auth.users where id = v_uid;
end $$;

-- ---------- who may call what ----------
revoke execute on function legal_info(), record_consent(text), export_my_data(), delete_my_account(boolean) from public, anon;
grant  execute on function legal_info() to anon, authenticated;
grant  execute on function record_consent(text), export_my_data(), delete_my_account(boolean) to authenticated;
