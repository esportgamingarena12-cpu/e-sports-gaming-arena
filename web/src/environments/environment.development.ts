// Local Supabase. Paste the values printed by `supabase status`.
// Only the anon key ever goes in web/ — never the service_role key.
export const environment = {
  production: false,
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'PASTE_LOCAL_ANON_KEY_FROM_supabase_status',
};
