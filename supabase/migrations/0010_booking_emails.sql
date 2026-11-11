-- 0010_booking_emails.sql : booking emails (FR-38, D10).
-- Triggers queue an email whenever a customer WITH an email address gets a booking created,
-- moved or cancelled. A job queues the reminder 1 hour before the start and then calls the Edge
-- Function `send-booking-email`, which sends the queued mails through Resend.
-- Counter and phone bookings for customers without an email address send nothing.

alter table bookings add column reminder_sent_at timestamptz;

create table booking_emails (
  id         bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete cascade,
  kind       text not null check (kind in ('created', 'rescheduled', 'cancelled', 'reminder')),
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts   int  not null default 0,
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index booking_emails_pending_idx on booking_emails (id) where status = 'pending';
alter table booking_emails enable row level security;   -- no policies: only the server side reads it
revoke all on booking_emails from anon, authenticated;

-- where the job finds the Edge Function (filled in once per project, see docs/DEPLOY.md)
create table mail_config (
  id           boolean primary key default true check (id),
  function_url text not null,
  anon_key     text not null,
  secret       text not null
);
alter table mail_config enable row level security;       -- no policies
revoke all on mail_config from anon, authenticated;

-- ---------- queue on create / move / cancel ----------
create function booking_email_queue() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_kind  text;
begin
  select email into v_email from customers where id = new.customer_id;
  if v_email is null or btrim(v_email) = '' then return new; end if;

  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then v_kind := 'created'; end if;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    v_kind := 'cancelled';
  elsif new.status = 'confirmed' and new.start_at <> old.start_at then
    v_kind := 'rescheduled';
  end if;

  if v_kind is not null then insert into booking_emails (booking_id, kind) values (new.id, v_kind); end if;
  return new;
end $$;

create trigger bookings_email_queue after insert or update on bookings
  for each row execute function booking_email_queue();

-- a moved booking gets a fresh reminder
create function booking_reset_reminder() returns trigger language plpgsql as $$
begin
  if new.start_at <> old.start_at then new.reminder_sent_at := null; end if;
  return new;
end $$;

create trigger bookings_reset_reminder before update on bookings
  for each row execute function booking_reset_reminder();

-- ---------- the job: queue reminders, then wake the sender ----------
create function run_booking_mail() returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg mail_config;
  n   int;
begin
  -- reminder 1 hour before; not for bookings made less than an hour before they start
  with due as (
    update bookings b set reminder_sent_at = now()
      from customers c
     where c.id = b.customer_id and coalesce(btrim(c.email), '') <> ''
       and b.status = 'confirmed' and b.reminder_sent_at is null
       and b.start_at > now() and b.start_at <= now() + interval '1 hour'
       and b.created_at <= b.start_at - interval '1 hour'
    returning b.id)
  insert into booking_emails (booking_id, kind) select id, 'reminder' from due;

  select * into cfg from mail_config;
  select count(*) into n from booking_emails where status = 'pending' and attempts < 3;
  if cfg.function_url is not null and n > 0 and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
    perform net.http_post(
      url     := cfg.function_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || cfg.anon_key,
                                    'x-mail-secret', cfg.secret),
      body    := '{}'::jsonb);
  end if;
end $$;
revoke execute on function run_booking_mail(), booking_email_queue(), booking_reset_reminder() from public, anon, authenticated;

do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net could not be enabled here (%). Enable it under Database > Extensions.', sqlerrm;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('booking-mail', '* * * * *', 'select public.run_booking_mail()');
  end if;
end $$;
