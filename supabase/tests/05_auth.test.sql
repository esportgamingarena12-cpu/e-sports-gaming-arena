begin;
select * from no_plan();

-- signup trigger -------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated', 'new-cust@t.dev',
   '{"full_name":"New Customer"}');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000000e5'),
          'customer', 'new signup gets a customer profile');
select is((select email from profiles where id = '00000000-0000-0000-0000-0000000000e5'),
          'new-cust@t.dev', 'profile stores the email');
select is((select full_name from profiles where id = '00000000-0000-0000-0000-0000000000e5'),
          'New Customer', 'profile takes the name from signup data');
select is((select active from profiles where id = '00000000-0000-0000-0000-0000000000e5'),
          true, 'new profile is active');

-- promote_admin ----------------------------------------------------------------------
select promote_admin('new-cust@t.dev');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000000e5'),
          'admin', 'promote_admin makes the user admin');
select throws_ok($$select promote_admin('nobody@t.dev')$$, 'No user with email nobody@t.dev',
                 'promote_admin refuses an unknown email');

-- last admin guard (demote every other admin first; E5 stays admin) -----------------------
update profiles set role = 'staff' where role = 'admin' and id <> '00000000-0000-0000-0000-0000000000e5';
select throws_ok(
  $$update profiles set role = 'staff' where id = '00000000-0000-0000-0000-0000000000e5'$$,
  'Cannot remove the last active admin', 'last admin cannot be demoted');
select throws_ok(
  $$update profiles set active = false where id = '00000000-0000-0000-0000-0000000000e5'$$,
  'Cannot remove the last active admin', 'last admin cannot be deactivated');

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e6', 'authenticated', 'authenticated', 'second-admin@t.dev');
select promote_admin('second-admin@t.dev');
select lives_ok(
  $$update profiles set role = 'staff' where id = '00000000-0000-0000-0000-0000000000e5'$$,
  'an admin can be demoted when another active admin exists');

-- customer cannot change own role ----------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e7', 'authenticated', 'authenticated', 'cust2@t.dev');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e7","role":"authenticated"}', true);
set local role authenticated;
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000e7';
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000000e7'),
          'customer', 'customer cannot promote themselves');
select is((select count(*)::int from profiles), 1, 'customer sees only their own profile');
reset role;

select * from finish();
rollback;
