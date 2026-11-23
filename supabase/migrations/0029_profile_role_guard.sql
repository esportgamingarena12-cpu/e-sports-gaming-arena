-- Phase 42 (security): a second lock on roles.
-- Today a customer or staff member is stopped from changing a role by a row level security rule on profiles.
-- This adds a trigger so the database refuses the change even if a policy is ever loosened by mistake:
-- while someone is signed in (auth.uid() is set), only an active admin may change a profile's role or active flag.
-- Not affected: the admin-create-staff function (it uses the service key, so nobody is "signed in" to the database),
-- promote_admin() run from the SQL editor, and an admin using the Staff screen.
create function guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard_role
  before update of role, active on profiles
  for each row
  when (old.role is distinct from new.role or old.active is distinct from new.active)
  execute function guard_profile_role();

revoke execute on function guard_profile_role() from public, anon, authenticated;
