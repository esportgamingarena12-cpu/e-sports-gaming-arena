# Deploying E-Sports Gaming Arena (v1)

Order matters: database, then email, then the web app, then the first login. Plan about 1 to 2 hours.
Do not use the secret (service) key anywhere in `web/`. It lives only inside Supabase.

You need: a Supabase account, a Resend account with a **verified sending domain**, a Netlify (or Vercel) account,
a domain name for the site, and Node 22 on your PC.

## 1. Production database (Supabase)

1. supabase.com > New project. Name: your shop. Region: **Mumbai (ap-south-1)**. Save the database password.
2. Note the **project ref** (the part before `.supabase.co`), the **Project URL** and the **anon public key**
   (Project Settings > API). Never copy the `service_role` key into `web/`.
3. Database > Extensions: enable `pg_cron`, `pg_net` and `btree_gist` (the migrations try to enable them and print a
   notice if they cannot).
4. Apply the migrations `supabase/migrations/0001` to `0013`, in order. Either:
   - With the CLI (needs Docker only for local work, not for this):
     ```bash
     npx supabase login
     npx supabase link --project-ref YOUR_PROJECT_REF
     npx supabase db push
     ```
   - Or paste each file into **SQL Editor** one after another, 0001 first. (This is how the dev project was built.)
5. Optional starting data: run `supabase/seed.sql` once in SQL Editor (sample stations, packages and products; edit
   them in the app afterwards). Do **not** run anything from `supabase/tests/` on production, and make sure the
   `pgtap` extension is switched off (Database > Extensions).
6. Check: `select jobname, schedule from cron.job;` shows `release-no-shows` and `booking-mail`.

## 2. Login emails (Supabase Auth + Resend)

1. Resend: Domains > add your domain and finish the DNS records until it shows **Verified**. Create an API key.
2. Supabase > Authentication > Providers > Email: enabled, "Confirm email" on.
3. Authentication > Emails > SMTP Settings: enable custom SMTP. Host `smtp.resend.com`, port `465`, user `resend`,
   password = the Resend API key, sender = an address on your verified domain (name: "E-Sports Gaming Arena").
4. Authentication > Emails > Templates > Magic Link: make sure the email shows the 6-digit code with `{{ .Token }}`.
5. Authentication > URL Configuration: Site URL = your final https address; add it to Redirect URLs too.
6. Until the domain is verified, Resend only delivers to the Resend account owner's own address.

## 3. Edge Functions and booking emails

Two functions live in `supabase/functions/`: `admin-create-staff` and `send-booking-email`.

1. Deploy both:
   ```bash
   npx supabase functions deploy admin-create-staff --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy send-booking-email --project-ref YOUR_PROJECT_REF
   ```
   (Or Edge Functions > Deploy via editor: paste `index.ts`, and for `send-booking-email` also add `email-text.ts`.)
2. Secret (Edge Functions > Secrets, or the CLI): your Resend key, and optionally the sender address:
   ```bash
   npx supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="E-Sports Gaming Arena <bookings@yourdomain.com>" --project-ref YOUR_PROJECT_REF
   ```
3. Tell the database where the function is (SQL Editor, once). The shared secret between the job and the function
   is generated here and lives only in the database; there is nothing to copy anywhere else:
   ```sql
   insert into mail_config (function_url, anon_key, secret) values
     ('https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-booking-email', 'YOUR_ANON_KEY',
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
   on conflict (id) do update set function_url = excluded.function_url, anon_key = excluded.anon_key;
   ```
4. How it works: when a customer who signed in with an email makes, moves or cancels a booking, an email is queued.
   Every minute the job `booking-mail` queues 1-hour reminders and wakes the function, which sends them.
   Counter or phone bookings for customers without an email address send nothing.
5. Test: make a booking as a customer; within about a minute the email arrives. Look at the queue with
   `select id, kind, status, attempts, error from booking_emails order by id desc limit 10;`
   (`failed` rows show the reason; the function retries 3 times).

## 4. The web app

1. In `web/src/environments/environment.ts` put the production Project URL and **anon** key, then commit it.
   (The anon key is public by design; Row Level Security protects the data.)
2. Check the build locally:
   ```bash
   cd web
   npm install --legacy-peer-deps
   npm run build
   npm run check:keys
   ```
   `check:keys` fails if the build contains anything but the anon key.
3. Netlify > Add new site > Import from Git (or drag the folder). Settings are in `web/netlify.toml`:
   base directory `web`, build command `npm run build && node scripts/check-build-keys.mjs`,
   publish directory `dist/web/browser`, and the single-page redirect rule.
4. Add your domain (Domain management) and switch on HTTPS. Use the same address in Supabase URL Configuration.
5. Open the site: the Book page should list free times after you add stations (step 5).

## 5. First login

1. Supabase > Authentication > Users > Add user: the owner's email and a strong password, "Auto confirm user" on.
2. SQL Editor: `select promote_admin('owner@email.com');`
3. Sign in at `/login`. Settings: shop name, address, phone, UPI ID, receipt width.
   Stations and rates, packages, booking settings and opening hours, products and opening stock.
4. Admin > Staff: create staff accounts (name, email, temporary password).
5. End-to-end check: book a slot as a customer, check in at the counter, take a payment, print the receipt,
   open Reports.

## 6. Install on phones and PCs

- Android (Chrome): menu > Install app. iPhone (Safari): Share > Add to Home Screen. Windows (Chrome or Edge): the
  install icon in the address bar. The app opens full screen; with no internet it shows a banner and the saved
  screens, but bookings, bills and stock always need a connection.

## 7. Before you go live

- Delete the test logins: `e2e.staff@`, `e2e.admin@`, `e2e.customer1..3@example.com` and `staff.test@example.com`
  (Authentication > Users), if they exist on this project.
- Rotate any API key that was ever pasted into a chat or document.
- Confirm `pgtap` is off and the `service_role` key appears nowhere in `web/` or the built site.
- Try a real thermal receipt print (Chrome print dialog: Margins None, Headers and footers off, Scale 100%) and scan
  the UPI QR with a real UPI app.

## Updating later

- Database changes: add a new numbered file in `supabase/migrations/` and apply it (never edit an applied one).
- Web changes: push to the connected branch; Netlify rebuilds. Installed apps update on the next open.
