-- 0003_auth.sql : profile on signup, profiles.email, last-admin guard.

alter table profiles add column email text;
update profiles p set email = u.email from auth.users u where u.id = p.id;

-- Every new auth user gets a profile with role 'customer' (staff are promoted by the
-- admin-create-staff Edge Function; the owner by promote_admin()).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, phone)
  values (new.id, new.email,
          nullif(new.raw_user_meta_data ->> 'full_name', ''),
          nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function handle_new_user();

revoke execute on function handle_new_user() from public, anon, authenticated;

-- Never leave the shop without an active admin.
create function guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from profiles
                      where role = 'admin' and active and id <> old.id) then
    raise exception 'Cannot remove the last active admin';
  end if;
  return new;
end $$;

create trigger profiles_guard_last_admin
  before update of role, active on profiles
  for each row execute function guard_last_admin();

revoke execute on function guard_last_admin() from public, anon, authenticated;
