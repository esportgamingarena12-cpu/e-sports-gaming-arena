// Production values. Anon key only (it is public by design; Row Level Security protects the data).
export const environment = {
  production: true,
  SUPABASE_URL: 'https://cwioasxspzutwglvnthl.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3aW9hc3hzcHp1dHdnbHZudGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNzk3MDIsImV4cCI6MjEwOTk1NTcwMn0.9l79EWy95_72tnk28TXfh07ZI-rJTnYuEgvV13EisPA',
  // Cloudflare Turnstile SITE key (public by design). Empty = the security check is off. The SECRET key lives only in Supabase.
  // The app sends its requests through this website's own door (web/functions/sb) so connections that block *.supabase.co still work. false = direct.
  API_PROXY: true,
  TURNSTILE_SITE_KEY: '0x4AAAAAAGR6lR0Q65WpAeFA',
};
