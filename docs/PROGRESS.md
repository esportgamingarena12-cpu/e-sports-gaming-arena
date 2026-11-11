# Progress

| Phase | Name | Status | Date | Notes |
| --- | --- | --- | --- | --- |
| 0 | Project setup | Done | 2026-11-10 | Angular 21 + Tailwind shell in web/, supabase/ folders. `supabase init` not run yet. |
| 1 | Database: core and billing | Done (verified on hosted dev project) | 2026-11-10 | Migrations 0001/0002 + seed applied; 51 pgTAP checks pass on Supabase project rfwozldwehmtjvgqpvid (no Docker). |
| 2 | Auth and roles | Done (verified on hosted dev project) | 2026-11-10 | Migration 0003 (11 pgTAP checks), Edge Function admin-create-staff, guards, staff and customer login. Browser-verified. |
| 3 | Admin settings | Done (verified on hosted dev project) | 2026-11-10 | Migration 0004 (booking_settings, opening_hours); 5 admin screens; 37 new pgTAP checks (06, 07); 13 web unit tests total. Browser-verified save/reload and validation on every screen. |
| 4 | Counter: stations | Done (verified on hosted dev project) | 2026-11-10 | Migration 0005 (server_now); /counter/stations with live timers, Realtime, start/pause/resume/stop/reopen/cancel; core/pricing.ts verified against 140 golden values from session_charge. Browser-verified. |
| 5 | Canteen and stock | Done (verified on hosted dev project) | 2026-11-10 | Migration 0006 (recent_stock_moves, Realtime for products + stock_moves); /counter/canteen and /counter/stock; 24 new pgTAP checks (09), 41 web unit tests total. Browser-verified at 360 px. |
| 6 | Checkout and receipts | Done (verified on hosted dev project) | 2026-11-11 | No new migration. Checkout dialog (station Bill + walk-in), split payments, UPI QR, receipt print layout 58/80 mm, /counter/bills with reprint and admin void. 23 new pgTAP checks (10); 53 unit tests; 2 Playwright tests. Browser-verified at 360 px. |
| 7 | Bookings | Done (verified on hosted dev project) | 2026-11-11 | Migration 0007 (customers, bookings, overlap rule, availability/create/cancel/reschedule/check-in/no-show functions, pg_cron job); /counter/bookings with list, day grid, search, New booking, Check in, Cancel, No-show; walk-in conflict warning. 92 pgTAP checks (11); 69 unit tests. Browser-verified at 360 px; scheduled job proven live. |
| 8 | Customer portal | Done (verified on hosted dev project) | 2026-11-11 | Migration 0008 (booking_info, save_my_profile, my_bills, get_reschedule_availability, shared availability logic). Public /book with free times, /book/profile, /book/my-bookings (change time, cancel, past bills), login keeps the chosen slot. 43 pgTAP checks (12); 79 unit tests; 6 Playwright customer tests (8 e2e in all). Booking reached the counter screen in about 1 s. |
| 9 | Dashboard and reports | Done (verified on hosted dev project) | 2026-11-11 | Migration 0009 (dashboard_today, sales_trend, busy_hours, sales_report admin-only; today_report for staff). /admin dashboard with tiles and SVG charts, /admin/reports with range and CSV export, /counter/today for staff. 44 pgTAP checks (13); 89 unit tests; 12 Playwright tests in all (4 new). Checked at 360 px. |
| 10 | Notifications, PWA, deploy | Emails verified live on the dev project; installs on phones and the production deploy are waiting on the owner | 2026-11-11 | Migration 0010 (email outbox, triggers, 1-hour reminder job), Edge Function send-booking-email, PWA (manifest, icons, offline banner), RLS review (docs/RLS-REVIEW.md, test 15), docs/DEPLOY.md, netlify.toml, build key scan. 23 + 32 new pgTAP checks (14, 15); 95 unit tests; 12 Playwright tests. |

## Environment (no Docker / no local Supabase)
- Hosted dev project: org "E Gaming Era", project ref `rfwozldwehmtjvgqpvid`. `web/` uses its URL and **anon** key only.
- Migrations and tests are applied through the dashboard SQL Editor. Tests are plain pgTAP files in `supabase/tests/`.
- Edge Function `admin-create-staff` was deployed through the dashboard editor; source is in `supabase/functions/`.
- Owner/admin account: egameera1@gmail.com (promoted with `promote_admin`).
- Auth emails: custom SMTP via Resend with sender `onboarding@resend.dev`; templates "Magic link" and "Confirm sign up" show `{{ .Token }}` (6-digit code).

## Decisions made in Phase 1
1. Sessions snapshot rate, billing block and minimum bill at start.
2. Time between Stop and Reopen counts as paused (not charged).
3. Tab items reserve stock (checked against all open tabs); stock deducts only at checkout.
4. bill_no is a plain incrementing integer; failed checkouts do not consume numbers.
5. A zero-total bill is allowed (e.g. fully discounted) with no payment rows.
6. A session in status `ended` (not yet billed) still blocks a new session on that station.
7. Seed prices: Maggi 50, Coffee 40 (Phase 6 example: 180 + 2x50 + 40 - 5 = 315).

## Decisions made in Phase 2
1. New auth users get a `customer` profile by trigger; staff are promoted by the Edge Function, owner by `promote_admin`.
2. The last active admin cannot be demoted or deactivated (trigger).
3. Staff temporary password: minimum 8 characters, no forced-change screen in v1.
4. Customer login is an emailed 6-digit code (D1). Disabled accounts are signed out with "Account disabled – contact Admin".

## Decisions made in Phase 3
1. Booking tables live in `0004_booking_settings.sql`; the Phase 7 bookings migration will therefore be `0005`.
2. No delete buttons on stations, packages or products (history references them); use the Active flag.
3. Default opening hours 10:00-22:00, all 7 days (my guess, edit on the Booking screen). `weekday`: 0 = Sunday.
4. Station and package types are free text, stored lowercase, with suggestions from existing values.
5. Slot sizes allowed: 15, 30, 60 minutes (default 30).
6. Opening stock on a new product is applied through `stock_move` (purchase, note "Opening stock").
7. Test data created while verifying (station PC 4, package PC 1 Hour, product Samosa, changed settings) was removed/restored to defaults.

## Decisions made in Phase 4
1. Shop name is **E-Sports Gaming Arena** (user correction). Changed in the app header, page title, seed.sql, the `settings` row and both auth email templates. NOT changed: `CLAUDE.md`, `docs/spec.md`, `START-HERE.md` (user documents, still say "E Gaming Era"), migration 0001's column default (applied migrations are never edited), the Supabase organisation/project names, and the Supabase SMTP sender name.
2. `server_now()` (migration 0005) gives every counter the same clock; the Bookings migration in Phase 7 is therefore `0006`.
3. `+ Items` and `Bill` are placeholders (Phases 5 and 6). `Stop` freezes the timer for now.
4. Ended sessions show "Ended - not billed" in orange; Cancel is admin only with a confirm step.
5. Phone is optional: 7 to 15 digits, `+` and spaces allowed.
6. Counter nav: `Stations` for staff, `Counter` for admin; other counter screens come in later phases.
7. Test sessions created while verifying were deleted.

## Decisions made in Phase 5
1. `recent_stock_moves(limit)` (migration 0006, staff only) returns the stock log with the user's display name (full name, else email, else "System"), because staff cannot read other profiles. The Bookings migration in Phase 7 is therefore `0007`.
2. `products` and `stock_moves` are in the Realtime publication, so stock changes show on every counter without refresh.
3. Availability on the canteen = stock minus items held by all open tabs minus the cart; untracked products are unlimited. A cart line is trimmed automatically if other counters use up the stock.
4. The cart is a root service: it survives moving between counter screens, not a reload or logout. Walk-in Checkout is a placeholder until Phase 6.
5. Stock dialog: purchase and wastage need a positive quantity, adjustment a signed non-zero change; notes required for wastage and adjustment (purchase note optional). A move that would make stock negative is blocked.
6. `+ Items` on a station card opens the canteen with that station's tab preselected (applied once).
7. Test data (a session, tab items, five stock moves, adjusted stock) was removed/restored to the seed values.

## Decisions made in Phase 6
1. No migration. Bills, bill_items and payments were already readable by staff; void_bill existed. The Bookings migration in Phase 7 is `0007`.
2. `Bill` on a station freezes the timer (end_session) and opens the checkout with the server's charge; cancelling the dialog leaves the station "Ended - not billed" (Resume still works).
3. After Confirm the dialog shows Print receipt (no auto-print) and Done. Reprint any bill from Bills.
4. UPI QR covers only the UPI part of the bill. With no UPI ID in Settings the dialog says so and shows no QR (UPI can still be recorded).
5. Bills screen refreshes on load, on date change, after a void, every 60 s and when the tab regains focus (no live push; `bills` is not in the Realtime publication).
6. Receipt page size is set with `@page { size: <58|80>mm auto; margin: 0 }`; the receipt is hidden on screen and the only thing visible when printing.
7. Playwright runs in the installed Google Chrome (`channel: 'chrome'`), uses a staff test account from the git-ignored `web/.env.e2e`, and leaves one bill per run behind. Run with `npm run e2e` from `web/`.
8. The seed no longer sets a placeholder shop address (it printed on receipts).
9. Test data (bills, sessions, stock moves, UPI ID, address) was removed/restored after verification and the bill counter reset to 1.

## Bugs found and fixed while verifying Phase 6
- A method named `void` on the Bills screen was read by Angular as the `void` operator, so the Void button did nothing (renamed `voidBill`).
- Logging in triggered two redirects to the home page, which could override a click made right after login (found by Playwright; fixed in `login.ts`).

## Decisions made in Phase 7
1. `0007_bookings.sql`. Uses `btree_gist` (no-double-booking exclusion constraint) and `pg_cron` (job `release-no-shows`, every 5 minutes). Both extensions were enabled from SQL on the hosted project. The Customer portal (Phase 8) adds a function for customers to save their own name/phone (`customers` rows with a login are created there).
2. Customers get online-bookable stations only, auto-assigned in station order; staff booking on behalf may use any active station of the type and may pick one. Staff bookings need a name and a phone (matched to an existing counter customer by digits).
3. Rules on every create/reschedule: opening hours of that weekday (India time, same day), booking window, slot boundary, min/max slots, start in the future. Customers cancel/reschedule only until the cutoff (2 h); staff any time.
4. A running per-hour session blocks only the current slot for new bookings; a package session blocks until the package ends; beyond that staff rely on the walk-in warning (FR-37).
5. Check-in: from 15 minutes before start until the booking ends; refused with a clear message if the station still has an open session (no automatic swap in v1). Check-in starts a per-hour session and links it (`sessions.booking_id`).
6. A trigger on `sessions` completes the booking when its session is billed and cancels it if the session is cancelled; `checkout_bill` is unchanged.
7. A confirmed booking past start + grace stops blocking immediately (availability and create_booking treat it as free); the 5-minute job and create/reschedule/check-in mark it No-show. Staff can mark No-show from the start time.
8. `get_availability(type, date, slots default 1, staff_view default false)`: free counts only, callable without logging in. `slots` counts stations free for the whole duration; `staff_view` (staff only) includes walk-in-only stations.
9. Bookings screen search covers a week back and the whole booking window ahead, by name or phone digits. `bookings` is in the Realtime publication.
10. Not built: Pending payment status (advance payment, D3), booking emails (Phase 10), customer screens (Phase 8), automatic station swap at check-in.
11. Test data (bookings, test customers, one test bill/session) was removed after verification; the scheduled job and extensions stay.

## Decisions made in Phase 8
1. `0008_customer_portal.sql`. Customers cannot read stations, settings or bills, so small functions give them exactly what they need: `booking_info()` (public: slot length, rules, bookable types), `save_my_profile`, `my_bills()`, `get_reschedule_availability`. `get_availability` now sits on a shared internal function (signature unchanged).
2. A login is never merged with a counter customer who has the same phone number (numbers are not verified, so merging would expose someone else's history). It always gets its own customer record.
3. "Past bills" are the bills of the customer's own checked-in bookings (via `sessions.booking_id`). Walk-in bills are not linked to a login. Payment references are never shown to customers.
4. Changing a booking keeps its length and station type; the booking's own slot does not count against itself. Customers can change or cancel until 2 h before the start (database rule; the screen hides the buttons after that and says to call the counter).
5. Free times are public; signing in is asked only on "Sign in to book". After login or the first-time name and phone page the customer returns to the same type, date, length and time. The `next` address is checked (in-app paths only).
6. Customer pages refresh by polling every 15 s (no Realtime for customers).
7. Playwright signs the customers in with a password through the auth API (`e2e.customer1..3@example.com`, shared password in the git-ignored `web/.env.e2e`) and hands the session to the page. The email-code login stays manually verified.
8. Bug found by the race test: the "slot just taken" message was inside the confirm panel, which closes on reload, so it vanished. It now sits outside.
9. Not covered by an automated browser test: the 1 h-before refusal on screen and past bills on screen (both covered by pgTAP 07 and 12 and unit tests). Test data was removed after verification; the three customer test logins remain.

## Decisions made in Phase 9
1. `0009_reports.sql`. Sales = total of PAID bills (after discount) on the India day the bill was created. Void bills are left out of sales and payments and counted separately (count and value). One shared internal function builds the report for both the admin range report and the staff Today report.
2. Staff get `today_report()` only (no date input), so they cannot read other days (D11). The dashboard, trend, busy-hours and range report refuse staff, customers and visitors.
3. Occupancy % per day = played minutes of sessions started that day (pauses removed) divided by active stations x opening minutes. It uses today's station list and opening hours for every day, so old days shift if stations or hours change later.
4. Busiest hours count sessions by their start hour (India time) over the last 30 days; the hour's sales are the paid bills of those sessions (walk-in canteen sales have no session, so they are not in it).
5. CSV: one row per day plus a TOTAL row, then payment modes and top items. UTF-8 with a byte order mark so Excel shows the rupee sign in the column titles; amounts are plain numbers (2 decimals) so Excel can add them. Download name `sales-FROM_to_TO.csv`.
6. Charts are inline SVG (no chart library). The 30-day chart draws sales (scaled to a round top value shown in the legend) and occupancy (0-100%) on one plot.
7. Test admin login `e2e.admin@example.com` (password in the git-ignored `web/.env.e2e`) was added to the dev project for Playwright. Test data was removed after verification and the bill counter reset.
8. Not checked: opening the CSV in real Excel (checked the byte order mark, columns and totals in the downloaded file); the dashboard with a month of real history (the dev project has none).

## Decisions made in Phase 10
1. `0010_booking_emails.sql`. An outbox table (`booking_emails`) is filled by triggers on `bookings`: confirmation on create, "moved" on reschedule, cancellation on cancel, only for customers who have an email (logins). A job `booking-mail` runs every minute: it queues the reminder (booking starts within the hour, not made less than an hour before it starts, once per start time) and then calls the Edge Function through `pg_net`. A moved booking gets a fresh reminder.
2. `send-booking-email` reads the queue with the service key (inside the function only), sends through Resend, retries 3 times, then marks `failed` with the reason. It accepts only calls whose `x-mail-secret` header equals `mail_config.secret` in the database (generated there, no second copy to keep in sync; a first version used an Edge Function secret and the two copies did not match when pasted by hand). Function secrets: `RESEND_API_KEY`, optional `MAIL_FROM`. `mail_config` also holds the function address (no one but the server can read it).
3. PWA: manifest "E-Sports Gaming Arena" (the spec says "E Gaming Era"; the new name is used), own icons (any and maskable), service worker caches the app shell only. API calls are never cached. An offline banner shows when the device has no connection; network errors read "No connection".
4. RLS review: no gaps. Result in `docs/RLS-REVIEW.md`; `15_rls_review.test.sql` keeps it true (every table has RLS, visitors have no table access, ledger tables cannot be written directly, helper functions are not callable).
5. `npm run check:keys` scans the built site and fails on anything but the public anon key (also runs in the Netlify build). The production `environment.ts` still holds a placeholder, so that check fails on purpose until real keys are put in.
6. Playwright runs against the dev project (there is no separate staging project).
7. Not done by me (needs the owner): verifying a sending domain in Resend (until then Resend only delivers to its account owner's address); creating the production Supabase project and the Netlify site; installing the app on Android and iPhone. `docs/DEPLOY.md` has every step.
7a. Live email test on the dev project (2026-11-11): a test booking for the owner's address queued a confirmation, a move and a cancellation; the function sent all three through Resend (status `sent`, no errors). Whether they reached the inbox is for the owner to confirm. The test booking, customer and queue rows were removed afterwards.
8. Verified here: emails are queued by real customer bookings in the browser tests (3 confirmations, 1 moved, 1 cancelled); the reminder rules and privacy by pgTAP; the app shell opens offline and the manifest has no installability errors in Chrome (only "in-incognito", from the test browser).

## Open items / to do later
- Phase 10 acceptance still open: owner confirms the 3 test emails reached the inbox; installs on Android and iPhone; production end-to-end. The 1-hour reminder email itself was proven by pgTAP only (a live one needs a booking starting within the hour).
- Delete the test login `e2e.admin@example.com` before production.
- Delete the test logins `e2e.customer1..3@example.com` and `e2e.staff@example.com` before production.
- Real email-code first sign-in for a brand-new customer was not repeated in Phase 8.
- Bookings tables have no data of their own yet; the shop opens with the default hours 10:00-22:00 (change on Admin > Booking).
- If the project is ever rebuilt from the migration files on another Supabase project, `pg_cron` may need switching on under Database > Extensions before the job is scheduled (the migration prints a notice if it cannot enable it).
- **Not done by me:** a physical thermal printer test (Chrome print dialog: Margins None, Headers and footers off, Scale 100%) and scanning the UPI QR with a real UPI app. Layout was checked with print-media emulation and the QR was checked by decoding it back to the exact link.
- Set the real shop address, phone, UPI ID and receipt width in Admin > Settings before going live.
- Playwright test account `e2e.staff@example.com` and the older `staff.test@example.com` exist in the dev project; remove them before production.
- Rename the Supabase organisation/project and the SMTP sender name (Authentication > Emails > SMTP Settings) to "E-Sports Gaming Arena" if wanted; the sender name needs the user (SMTP settings).
- Update `CLAUDE.md`, `docs/spec.md`, `START-HERE.md` titles/PWA app name to the new name if wanted (spec Phase 10 says PWA app name "E Gaming Era").
- pricing.ts uses millisecond timestamps; the database uses microseconds, so a charge could differ by one block only when a session sits within a millisecond of a block boundary. The live number is display only; the bill is calculated by the server in Phase 6.
- Phase 3 staff-access check relied on the shared `adminGuard` (unit tests + Phase 2 browser check) and pgTAP; a fresh staff browser login on the new routes was not repeated (it would sign out the admin session, which needs a new email code).
- Screens were checked at the browser pane width (about 440 px), not an exact 360 px viewport.
- **Resend limits (Phase 10):** `onboarding@resend.dev` only delivers to the Resend account owner's address. Verify a sending domain in Resend before real customers use the booking site, and replace the SMTP sender.
- **Rotate the Resend API key** that was shown in chat during setup (create a new key, update it in Supabase SMTP settings).
- Test account `staff.test@example.com` exists (deactivated) in the dev project; delete when no longer needed.
- Disable the `pgtap` extension on the production project (Phase 10).
- Seed prices for Cold Drink, Chips, Water, Sandwich are placeholders; adjust in Phase 3 screens.
- Not run: "supabase db reset runs clean twice" (needs local Supabase CLI + Docker).
- Customer first-time signup (a brand-new email) through the code flow was not tested; only an existing user's code login was.
- Minor: after a full page reload the top bar briefly shows the signed-out buttons until the session is restored.
