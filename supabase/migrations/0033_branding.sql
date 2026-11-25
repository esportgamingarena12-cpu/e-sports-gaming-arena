-- Phase 45: editable branding. The Admin changes the wording of the public home page (and the shop name shown everywhere)
-- in Settings instead of it being fixed in the code.
-- Every field is optional: an empty field means "use the built-in wording", so nothing changes until the Admin edits it.
-- Nothing here touches money, bookings, sessions, stock or passes.

alter table settings
  add column brand_tagline       text  check (char_length(brand_tagline)       <= 120),
  add column brand_hero_text     text  check (char_length(brand_hero_text)     <= 400),
  add column brand_features      jsonb check (brand_features is null or (jsonb_typeof(brand_features) = 'array' and jsonb_array_length(brand_features) <= 4 and char_length(brand_features::text) <= 1500)),
  add column brand_studio_title  text  check (char_length(brand_studio_title)  <= 120),
  add column brand_studio_text   text  check (char_length(brand_studio_text)   <= 500),
  add column brand_checks        jsonb check (brand_checks is null or (jsonb_typeof(brand_checks) = 'array' and jsonb_array_length(brand_checks) <= 4 and char_length(brand_checks::text) <= 1000)),
  add column brand_rates_intro   text  check (char_length(brand_rates_intro)   <= 200),
  add column brand_canteen_intro text  check (char_length(brand_canteen_intro) <= 200),
  add column brand_passes_intro  text  check (char_length(brand_passes_intro)  <= 200),
  add column brand_band_title    text  check (char_length(brand_band_title)    <= 100),
  add column brand_band_text     text  check (char_length(brand_band_text)     <= 200),
  add column brand_footer        text  check (char_length(brand_footer)        <= 120);

-- only the Admin can change them (the existing settings_update policy already requires is_admin())
grant update (brand_tagline, brand_hero_text, brand_features, brand_studio_title, brand_studio_text, brand_checks,
              brand_rates_intro, brand_canteen_intro, brand_passes_intro, brand_band_title, brand_band_text, brand_footer)
  on settings to authenticated;

-- the public pages read this before anyone signs in: it holds only wording a shop prints on its own door
create function branding_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_name',          s.shop_name,
    'tagline',            s.brand_tagline,
    'hero_text',          s.brand_hero_text,
    'features',           s.brand_features,
    'studio_title',       s.brand_studio_title,
    'studio_text',        s.brand_studio_text,
    'checks',             s.brand_checks,
    'rates_intro',        s.brand_rates_intro,
    'canteen_intro',      s.brand_canteen_intro,
    'passes_intro',       s.brand_passes_intro,
    'band_title',         s.brand_band_title,
    'band_text',          s.brand_band_text,
    'footer',             s.brand_footer)
    from settings s
$$;

revoke execute on function branding_info() from public, anon;
grant  execute on function branding_info() to anon, authenticated;
