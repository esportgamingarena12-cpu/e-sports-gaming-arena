-- Paste this whole file into the Supabase dashboard SQL editor and press Run (AFTER migration 0033 is applied).
-- It checks the editable branding: anyone can read it, only an Admin can change it, bad values are refused, and nothing private is shown.
-- It ALWAYS ends with a red "TEST RESULT" message: that is how it rolls everything back, so no setting stays changed.
-- Every line should start with "ok"; "NOT OK" is a failure.

create or replace function pg_temp.chk(res text[], ok boolean, name text) returns text[]
language sql as $$ select res || (case when coalesce(ok, false) then 'ok      - ' else 'NOT OK  - ' end || name) $$;

do $$
declare
  res  text[] := '{}';
  adm  uuid := '00000000-0000-0000-0000-0000000000f1';
  stf  uuid := '00000000-0000-0000-0000-0000000000f2';
  j    jsonb;
  bad  int;
  n    int;
  ok   boolean;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (adm, 'authenticated', 'authenticated', 'admin-br@t.dev', '{}'),
    (stf, 'authenticated', 'authenticated', 'staff-br@t.dev', '{}')
  on conflict do nothing;
  update profiles set role = 'admin' where id = adm;
  update profiles set role = 'staff' where id = stf;

  -- ===== a visitor reads the public wording =====
  set local role anon;
  j := branding_info();
  reset role;
  res := pg_temp.chk(res, jsonb_typeof(j) = 'object' and j ? 'shop_name' and j ? 'tagline' and j ? 'features' and j ? 'footer', 'a visitor can read the branding');
  res := pg_temp.chk(res, not (j::text ~* 'upi|password|secret|gstin|grievance|phone'), 'the public branding shows nothing private (no UPI id, phone, GSTIN or contact)');
  res := pg_temp.chk(res, (select count(*) from jsonb_object_keys(j)) = 13, 'it has exactly the 13 branding fields');

  -- ===== the Admin can change it =====
  perform set_config('request.jwt.claims', '{"sub":"' || adm || '","role":"authenticated"}', true);
  set local role authenticated;
  update settings set brand_tagline = 'Game | Win', brand_features = '[{"title":"A","text":"b"}]'::jsonb, brand_checks = '["x","y"]'::jsonb, brand_footer = '(c) {shop}' where id = true;
  get diagnostics n = row_count;
  reset role;
  res := pg_temp.chk(res, n = 1, 'the Admin can save branding');
  set local role anon;
  j := branding_info();
  reset role;
  res := pg_temp.chk(res, j->>'tagline' = 'Game | Win' and j->'features'->0->>'title' = 'A' and j->'checks'->>1 = 'y', 'a visitor then sees the new wording');

  -- ===== a staff member cannot =====
  perform set_config('request.jwt.claims', '{"sub":"' || stf || '","role":"authenticated"}', true);
  set local role authenticated;
  update settings set brand_tagline = 'Hacked' where id = true;
  get diagnostics n = row_count;
  reset role;
  res := pg_temp.chk(res, n = 0, 'a staff member cannot change the branding');
  res := pg_temp.chk(res, (select brand_tagline from settings) = 'Game | Win', 'and the wording is unchanged');

  -- ===== a visitor cannot =====
  set local role anon;
  begin
    update settings set brand_tagline = 'Hacked' where id = true;
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  res := pg_temp.chk(res, ok, 'a visitor cannot change the branding');

  -- ===== bad values are refused =====
  ok := false;
  begin update settings set brand_tagline = repeat('x', 121) where id = true; exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'a tagline over 120 characters is refused');
  ok := false;
  begin update settings set brand_hero_text = repeat('x', 401) where id = true; exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'a welcome paragraph over 400 characters is refused');
  ok := false;
  begin update settings set brand_features = '[1,2,3,4,5]'::jsonb where id = true; exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'more than 4 highlights are refused');
  ok := false;
  begin update settings set brand_checks = '{"a":1}'::jsonb where id = true; exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'a check-list that is not a list is refused');
  ok := false;
  begin update settings set brand_features = to_jsonb(repeat('x', 2000)) where id = true; exception when check_violation then ok := true; end;
  res := pg_temp.chk(res, ok, 'highlights that are not a list (or are huge) are refused');

  -- ===== nothing else moved =====
  res := pg_temp.chk(res, (select count(*) from settings) = 1, 'there is still exactly one settings row');

  select count(*) into bad from unnest(res) l where l like 'NOT OK%';
  raise exception E'TEST RESULT: % checks, % failed (this message is how the test rolls itself back)\n%', array_length(res, 1), bad, array_to_string(res, E'\n');
end $$;
