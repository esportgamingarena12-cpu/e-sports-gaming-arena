// Supabase project for E-Sports Gaming Arena (account: the single owner email). Anon key only,
// never put the secret (service) key in web/.
export const environment = {
  production: false,
  SUPABASE_URL: 'https://cwioasxspzutwglvnthl.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3aW9hc3hzcHp1dHdnbHZudGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNzk3MDIsImV4cCI6MjEwOTk1NTcwMn0.9l79EWy95_72tnk28TXfh07ZI-rJTnYuEgvV13EisPA',
  // Cloudflare Turnstile SITE key (public by design). Empty = the security check is off. The SECRET key lives only in Supabase.
  TURNSTILE_SITE_KEY: '0x4AAAAAAGR6lR0Q65WpAeFA',
};
