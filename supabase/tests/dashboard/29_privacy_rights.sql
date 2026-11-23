-- Paste this whole file into the Supabase dashboard SQL editor and press Run.
-- It checks migration 0030: the public legal details, the consent record, "download my data" and "delete my account"
-- (including that deleting an account changes no money, booking, session or walk-in record).
-- It needs no extra extension. It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back,
-- so the test customers, bookings and bills it creates do not stay. Every line should start with "ok"; "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res    text[] := '{}';
  c1     uuid := '00000000-0000-0000-0000-0000000000e1';
  c2     uuid := '00000000-0000-0000-0000-0000000000e2';
  adm    uuid := '00000000-0000-0000-0000-0000000000e3';
  stf    uuid := '00000000-0000-0000-0000-0000000000e4';
  j      jsonb;
  r      text;
  n      int;
  state  text;
  msg    text;
  bad    int;
  v_st1  bigint;
  v_st2  bigint;
  v_cust bigint;
  v_bk_a bigint;
  v_bk_b bigint;
  v_pt   bigint;
  v_sess bigint;
  v_bill bigint;
  v_st3  bigint;
  v_walk bigint;
  v_wsess bigint;
  before_t text;
  after_t  text;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (c1,  'authenticated', 'authenticated', 'cust1-pr@t.dev', '{}'),
    (c2,  'authenticated', 'authenticated', 'cust2-pr@t.dev', '{}'),
    (adm, 'authenticated', 'authenticated', 'admin-pr@t.dev', '{}'),
    (stf, 'authenticated', 'authenticated', 'staff-pr@t.dev', '{}')
  on conflict do nothing;
  update profiles set role = 'admin' where id = adm;
  update profiles set role = 'staff' where id = stf;
  insert into stations (name, type, rate_per_hour, sort_order) values ('T30 PC A', 'pc', 90, 981), ('T30 PC B', 'pc', 90, 982);
  select id into v_st1 from stations where name = 'T30 PC A';
  select id into v_st2 from stations where name = 'T30 PC B';
  insert into stations (name, type, rate_per_hour, sort_order) values ('T30 PC C', 'pc', 90, 983);
  select id into v_st3 from stations where name = 'T30 PC C';

  -- ===== public legal details =====
  set local role anon;
  j := legal_info();
  reset role;
  res := pg_temp.chk(res, jsonb_typeof(j) = 'object' and j ? 'shop_name' and j ? 'grievance_email' and j ? 'refund_days' and j ? 'record_years' and j ? 'cutoff_hours',
                     'a visitor can read the legal details (shop name, grievance contact, refund days, record years, cancel hours)');
  res := pg_temp.chk(res, not (j ? 'upi_id') and not (j ? 'receipt_footer') and not (j::text ~* 'upi|password|secret'), 'the public legal details show no UPI id or anything private');

  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  update settings set grievance_email = 'privacy-pr@t.dev', grievance_name = 'Test Officer', legal_name = 'Test Legal Name';
  reset role;
  set local role anon;
  j := legal_info();
  reset role;
  res := pg_temp.chk(res, j->>'grievance_email' = 'privacy-pr@t.dev' and j->>'legal_name' = 'Test Legal Name', 'the admin can set the grievance contact and legal name, and visitors then see them');

  perform set_config('request.jwt.claims', '{"sub":"' || c1 || '","role":"authenticated"}', true);
  set local role authenticated;
  begin update settings set grievance_email = 'hacker@t.dev'; exception when others then null; end;
  reset role;
  res := pg_temp.chk(res, (select grievance_email from settings) = 'privacy-pr@t.dev', 'a customer cannot change the legal details');

  -- ===== consent =====
  set local role authenticated;
  perform save_my_profile('Aarav Private', '9876543210');
  reset role;
  select id into v_cust from customers where profile_id = c1;
  res := pg_temp.chk(res, (select consent_version is null from profiles where id = c1), 'a new customer has not agreed yet (no consent recorded)');
  set local role authenticated;
  perform record_consent('2026-11-23');
  reset role;
  res := pg_temp.chk(res, (select consent_version = '2026-11-23' and consented_at is not null from profiles where id = c1), 'record_consent stores the version and the time');
  set local role authenticated;
  begin perform record_consent('not a version'); state := null; exception when others then state := sqlstate; msg := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, msg = 'Invalid version', 'a made-up version text is refused');
  set local role authenticated;
  begin update profiles set consent_version = 'x' where id = c1; state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a customer cannot write the consent columns directly (only through record_consent)');
  set local role anon;
  begin perform record_consent('2026-11-23'); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot record consent');

  -- ===== give customer 1 some data: a future booking, a past billed visit, an active pass =====
  perform set_config('request.jwt.claims', '{"sub":"' || c2 || '","role":"authenticated"}', true);
  set local role authenticated;
  perform save_my_profile('Other Person', '9123456789');
  reset role;

  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel, notes, created_by)
  values (v_cust, 'pc', v_st1, now() + interval '2 days', now() + interval '2 days 1 hour', 1, 'confirmed', 'online', 'my private note', c1)
  returning id into v_bk_a;
  insert into bookings (customer_id, station_type, station_id, start_at, end_at, slots, status, channel, notes, created_by)
  values (v_cust, 'pc', v_st2, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 1, 'checked_in', 'online', 'old note', c1)
  returning id into v_bk_b;
  insert into sessions (station_id, customer_name, customer_phone, rate_per_hour, block_min, min_bill_min, booking_id, status, ended_at)
  values (v_st2, 'Aarav Private', '9876543210', 90, 15, 30, v_bk_b, 'ended', now() - interval '3 days' + interval '1 hour')
  returning id into v_sess;
  insert into pass_types (name, price, validity_days, kind, minutes_total) values ('T30 Pass', 500, 30, 'hours', 600) returning id into v_pt;
  insert into customer_passes (customer_id, pass_type_id, name, kind, price, minutes_total, expires_at)
  values (v_cust, v_pt, 'T30 Pass', 'hours', 500, 600, now() + interval '30 days');
  select count(*) into n from booking_emails where booking_id in (v_bk_a, v_bk_b);
  res := pg_temp.chk(res, n >= 1, 'setup: the new booking queued an email (' || n || ')');

  -- ===== download my data =====
  perform set_config('request.jwt.claims', '{"sub":"' || c1 || '","role":"authenticated"}', true);
  set local role authenticated;
  j := export_my_data();
  reset role;
  res := pg_temp.chk(res, j->'account'->>'email' = 'cust1-pr@t.dev' and j->'account'->>'name' = 'Aarav Private', 'the download has the customer''s account details');
  res := pg_temp.chk(res, jsonb_array_length(j->'bookings') = 2 and jsonb_array_length(j->'passes') = 1, 'the download has both bookings and the pass');
  res := pg_temp.chk(res, j::text like '%my private note%', 'the download includes the booking notes');
  perform set_config('request.jwt.claims', '{"sub":"' || c2 || '","role":"authenticated"}', true);
  set local role authenticated;
  j := export_my_data();
  reset role;
  res := pg_temp.chk(res, jsonb_array_length(j->'bookings') = 0 and j::text not like '%Aarav%' and j::text not like '%private note%', 'another customer''s download has none of customer 1''s data');
  set local role anon;
  begin perform export_my_data(); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot download anyone''s data');

  -- a walk-in customer at the counter (no login) who even has the SAME phone number, with a session running right now
  insert into customers (name, phone) values ('Walkin Wally', '9876543210') returning id into v_walk;
  insert into sessions (station_id, customer_name, customer_phone, rate_per_hour, block_min, min_bill_min, status)
  values (v_st3, 'Walkin Wally', '9876543210', 90, 15, 30, 'running') returning id into v_wsess;

  -- ===== delete my account: the refusals =====
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  begin perform delete_my_account(true); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501' and exists (select 1 from auth.users where id = stf), 'a staff login cannot use delete my account (the Admin removes staff)');
  set local role anon;
  begin perform delete_my_account(true); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = '42501', 'a visitor cannot delete accounts');

  perform set_config('request.jwt.claims', '{"sub":"' || c1 || '","role":"authenticated"}', true);
  set local role authenticated;
  begin perform delete_my_account(true); state := null; msg := null; exception when others then state := sqlstate; msg := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, msg like '%session in progress%' and exists (select 1 from auth.users where id = c1), 'refused while a session is ended but not yet billed (nothing deleted)');

  -- the visit is billed now: the bill the shop must keep
  update sessions set status = 'billed' where id = v_sess;
  insert into bills (session_id, customer_name, gaming_charge, canteen_total, subtotal, discount, total, status)
  values (v_sess, 'Aarav Private', 90, 0, 90, 0, 90, 'paid') returning bill_no into v_bill;
  insert into payments (bill_no, mode, amount) values (v_bill, 'cash', 90);

  set local role authenticated;
  begin perform delete_my_account(true); state := null; msg := null; exception when others then state := sqlstate; msg := sqlerrm; end;
  reset role;
  res := pg_temp.chk(res, msg like '%upcoming booking%' and exists (select 1 from auth.users where id = c1), 'refused while a booking is still upcoming (nothing deleted)');
  res := pg_temp.chk(res, (select status::text from bookings where id = v_bk_a) = 'confirmed', 'the upcoming booking is still confirmed (not touched)');

  -- the customer cancels it themselves (as the app does), then the pass question comes up
  update bookings set status = 'cancelled', cancelled_at = now() where id = v_bk_a;
  set local role authenticated;
  begin perform delete_my_account(false); state := null; exception when others then state := sqlstate; end;
  reset role;
  res := pg_temp.chk(res, state = 'PB001' and exists (select 1 from auth.users where id = c1), 'with an unused pass it asks first (PB001) and deletes nothing');

  -- the numbers the shop's reports are built from, just before the deletion
  select concat_ws('|',
           (select count(*) || ',' || coalesce(sum(total), 0) || ',' || coalesce(sum(gaming_charge), 0) || ',' || coalesce(sum(subtotal), 0) from bills),
           (select count(*) || ',' || coalesce(sum(amount), 0) from payments),
           (select count(*) from bill_items),
           (select count(*) from stock_moves),
           (select count(*) || ',' || count(*) filter (where status = 'completed') || ',' || count(*) filter (where status = 'cancelled') || ',' || count(*) filter (where status = 'confirmed') from bookings),
           (select count(*) || ',' || count(*) filter (where status = 'running') || ',' || count(*) filter (where status = 'billed') from sessions),
           (select count(*) || ',' || count(*) filter (where status = 'active') || ',' || coalesce(sum(price), 0) from customer_passes),
           (select count(*) from customers)) into before_t;

  -- ===== delete my account: it goes through =====
  set local role authenticated;
  perform delete_my_account(true);
  reset role;

  select concat_ws('|',
           (select count(*) || ',' || coalesce(sum(total), 0) || ',' || coalesce(sum(gaming_charge), 0) || ',' || coalesce(sum(subtotal), 0) from bills),
           (select count(*) || ',' || coalesce(sum(amount), 0) from payments),
           (select count(*) from bill_items),
           (select count(*) from stock_moves),
           (select count(*) || ',' || count(*) filter (where status = 'completed') || ',' || count(*) filter (where status = 'cancelled') || ',' || count(*) filter (where status = 'confirmed') from bookings),
           (select count(*) || ',' || count(*) filter (where status = 'running') || ',' || count(*) filter (where status = 'billed') from sessions),
           (select count(*) || ',' || count(*) filter (where status = 'active') || ',' || coalesce(sum(price), 0) from customer_passes),
           (select count(*) from customers)) into after_t;
  res := pg_temp.chk(res, before_t = after_t, 'MONEY AND COUNTS UNCHANGED: bills, totals, payments, bill lines, stock moves, bookings by status, sessions by status, passes and customers are exactly the same (' || before_t || ')');

  res := pg_temp.chk(res, not exists (select 1 from auth.users where id = c1), 'the login is gone');
  res := pg_temp.chk(res, not exists (select 1 from profiles where id = c1), 'the profile is gone');
  res := pg_temp.chk(res, (select name = 'Deleted customer' and phone is null and email is null and profile_id is null from customers where id = v_cust), 'the customer record no longer has a name, phone, email or login');
  res := pg_temp.chk(res, (select count(*) from bookings where customer_id = v_cust and (notes is not null or created_by is not null)) = 0, 'booking notes and the creator id are wiped');
  res := pg_temp.chk(res, (select count(*) from booking_emails where booking_id in (v_bk_a, v_bk_b)) = 0, 'no emails are left waiting for the deleted customer');
  res := pg_temp.chk(res, (select customer_name is null and customer_phone is null from sessions where id = v_sess), 'the name and phone are removed from that customer''s past session');
  res := pg_temp.chk(res, (select customer_name is null from bills where bill_no = v_bill), 'the name is removed from that customer''s bill');
  res := pg_temp.chk(res, (select total = 90 and status = 'paid' and gaming_charge = 90 from bills where bill_no = v_bill), 'but the bill keeps its amount and status');
  res := pg_temp.chk(res, (select status from customer_passes where customer_id = v_cust) = 'active', 'the pass record itself is not changed');
  res := pg_temp.chk(res, (select status::text from sessions where id = v_wsess) = 'running' and (select customer_name from sessions where id = v_wsess) = 'Walkin Wally' and (select customer_phone from sessions where id = v_wsess) = '9876543210', 'the walk-in session running at the counter is untouched (even with the same phone number)');
  res := pg_temp.chk(res, (select name = 'Walkin Wally' and phone = '9876543210' from customers where id = v_walk), 'the walk-in customer record is untouched');
  res := pg_temp.chk(res, exists (select 1 from profiles where id = c2) and (select name from customers where profile_id = c2) = 'Other Person', 'another customer with a login is untouched');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
