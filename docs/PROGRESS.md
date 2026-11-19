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
| 10 | Notifications, PWA, deploy | Emails verified live and received (dev project); installs on phones and the production deploy are waiting on the owner | 2026-11-11 | Migration 0010 (email outbox, triggers, 1-hour reminder job), Edge Function send-booking-email, PWA (manifest, icons, offline banner), RLS review (docs/RLS-REVIEW.md, test 15), docs/DEPLOY.md, netlify.toml, build key scan. 23 + 32 new pgTAP checks (14, 15); 95 unit tests; 12 Playwright tests. |
| 11 | New look (mockup palette, mobile first) | Done (verified on the dev project) | 2026-11-11 | Brand palette and fonts as theme tokens; sidebar layout with phone menu and bottom bar for staff/admin, top bar for customers; landing page with hero, booking card and real rates; dashboard redesign (tiles, station quick view, donut, live sessions, quick actions); every screen checked at 360 px and 1280 px. Migration 0011 (rates in booking_info). 99 unit tests; 12 Playwright tests. |
| 12 | Memberships (prepaid passes) | Done (verified on the dev project) | 2026-11-11 | Migrations 0012 (pass types, sold passes, sell / start / look up / cancel, billing, void, reports) and 0013 (pass name on the bill line). Admin Pass setup, counter Passes screen, Start dialog finds a customer's pass by phone, customers see My passes. 62 pgTAP checks (16) and the RLS test extended (47); 117 unit tests; 18 Playwright tests. |
| 13 | Mockup design (landing page, dashboard, illustrations) | Done (verified on the dev project) | 2026-11-11 | Migration 0014 (passes and a "most popular" flag in booking_info). Landing page like the mockup: hero with neon illustration, feature strip, studio section, Choose Your Plan cards from real rates and passes, booking card, closing band. Dashboard: live sessions with amounts, highlights, area chart; sidebar illustration. 128 unit tests; 18 Playwright tests; all routes checked at 360 and 1280 px. |
| 14 | Customers screen | Done (verified on the dev project) | 2026-11-11 | Migration 0015 (staff note, customer_list, customer_detail, update_customer; the notes column hidden from every direct read). /counter/customers: search by name, phone or login email; detail with bookings, passes, bills, spend, no-show warning, editable details and a staff note; Book for this customer and Sell a pass hand-overs. 49 pgTAP checks (17); 134 unit tests; 23 Playwright tests. |
| 15 | Mockup match (second pass) | Done (verified on the dev project) | 2026-11-11 | Landing page and admin shell rebuilt to follow the mockup: hero art bleeding to the edge, overlapping feature panel, studio, plan cards, controller band; sidebar with mockup names and gradient pill; top bar with customer search (Ctrl + K), alerts bell and user menu; dashboard with icon tiles, systems quick view, revenue overview (week / 7 / 30 days, % vs previous, smooth chart), session donut, live sessions table with avatars and amounts, quick actions and highlights. 150 unit tests; 28 Playwright tests; every route checked at 360, 768, 1280 and 1536 px. |
| 16 | Login look | Done (one older e2e test needs a data cleanup, see below) | 2026-11-11 | Both login pages are now split screens: an animated neon arena banner (moving screens, sweeping beams, sparks, floating controller, flickering sign) beside a glowing form card with icons and a show/hide password button. The customer banner shows the real hourly rates. 153 unit tests; 9 new Playwright tests. |
| 17 | Move to one account (Supabase, GitHub, Cloudflare) | In progress: emails verified; owner still to verify a Resend domain, create test logins and delete the old project | 2026-11-11 | New Supabase project `cwioasxspzutwglvnthl`: migrations 0001-0015, admin `esport.gamingarena12@gmail.com`, staff `egamerera1@gmail.com`, starter data, 5 PC (Rs 90/h) and 3 PS5 (Rs 110/h) stations, both Edge Functions deployed, mail_config set, `booking-mail` and `release-no-shows` jobs active. Code on GitHub `esportgamingarena12-cpu/e-sports-gaming-arena`; live on Cloudflare Pages `e-sports-gaming-arena.pages.dev` (rebuilds on every push to main). Buttons are now purple with white text. Login code email and booking email both verified live (Resend, new key); Site URL and Redirect URLs set. |
| 18 | Shop updates (home page, hours, daily pass, food photos, time-up pop-up) | Built, DB and public checks verified; admin screens wait for the e2e test logins | 2026-11-16 | Migration 0016: opening hours (Mon-Fri 12:00-22:00, Sat-Sun 11:00-22:00), pass `original_price` (discount badge), public `booking_info()` now lists hours and the rate-card packages, Storage bucket `food-images` (public read, admin-only write) + `products.image_path`, `delete_product()`, session alarm (`alarm_minutes`, `alarm_extra_minutes`, `set_session_alarm`, `extend_session_alarm`). Home page: Games available, rate card table, opening hours, discount and daily-pass wording; Phase 18b (migration 0017) redesigned it: one rate card (the duplicate hourly plan cards are gone, the passes section only appears when passes exist), a live "Open now / Opens at" status with today highlighted, and a canteen highlight with up to 6 featured items. Admin Products: photo upload, remove, delete. Time-up pop-up with sound on every staff and admin screen; hourly sessions get an optional timer in the Start dialog. 45 new pgTAP checks (test 18, all pass, rolled back); 193 unit tests; public Playwright checks pass at 360, 768 and 1280 px. |
| 19 | Home page slider | Done (public checks verified; no database change) | 2026-11-16 | The hero is now a 4-slide slider: 1 the welcome hero (unchanged), 2 Games available, 3 Timings, 4 Canteen. Slides 2 to 4 are built from the shop's own data (games with their lowest starting price, opening hours with a live Open now / Opens at badge and a neon clock showing India time, up to 4 canteen items) and are left out when there is nothing to show. Auto-play (7 s), swipe, arrow buttons, dots, left/right keys, pause on hover and focus; no auto-play and no sliding for people who ask for less motion. 214 unit tests; 12 new Playwright checks; every slide fits at 360, 768 and 1280 px. |
| 20 | Games list and coming-soon ticker | Done (DB and public checks verified; admin screen waits for the e2e test logins) | 2026-11-16 | Migrations 0018 and 0019: `games` table (title, platform, available or coming soon, Hot, New, release date, note, poster, order, on/off), public bucket `game-images` (admin-only writes), `booking_info()` now returns `games` (up to 24, hot and new first) and `upcoming` (up to 10, soonest first). Admin > Games (Setup menu). Home: the Games available slide lists the games as posters with HOT / NEW badges and a PC / PS5 filter; a ticker strip at the top scrolls upcoming games with release date and countdown and games marked New. 36 pgTAP checks (test 20, all pass, rolled back), 231 unit tests, 19 public Playwright checks. |
| 21 | Google sign-in for customers | App side done and tested; waiting on the owner to switch Google on (Google Cloud + Supabase) | 2026-11-16 | The customer login leads with a "Continue with Google" button; the email code is a small backup link. Returning from Google signs the customer in and sends them to the page they wanted (first-timers give name and phone first, with the name filled in from Google). Until Google is switched on in Supabase the button explains that and offers the email code. No database change. 242 unit tests; 10 new Playwright checks (the Google hand-off is stubbed: a real Google sign-in cannot be automated). |
| 22 | Email sign up and sign in for customers | Built and tested with stubbed answers; needs "Confirm email" switched off in Supabase to work for customers today | 2026-11-16 | The customer login now has Google, then two tabs: Sign in (email, password, Remember me) and Create account (Full name, Email, Password, Confirm password, Remember me ticked by default); the email code stays as a small backup. Password rules: 8 to 72 bytes, letters and a number, not the email. Unticking Remember me signs the customer out when the browser is closed. 255 unit tests; 14 new Playwright checks. |
| 23 | Remove the email code login | Done | 2026-11-16 | The customer login is now only Google, Create account and Sign in (email and password). The "Use an email code instead" link, the code screens and the two email-code functions in the auth service were removed; messages now point to Google or email and password. Spec decision D1 (email OTP) is marked as changed by the owner. 255 unit tests; browser checks updated. |

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
7a. Live email test on the dev project (2026-11-11): a test booking for the owner's address queued a confirmation, a move and a cancellation; the function sent all three through Resend (status `sent`, no errors). The owner confirmed all three arrived in the inbox. The test booking, customer and queue rows were removed afterwards.
8. Verified here: emails are queued by real customer bookings in the browser tests (3 confirmations, 1 moved, 1 cancelled); the reminder rules and privacy by pgTAP; the app shell opens offline and the manifest has no installability errors in Chrome (only "in-incognito", from the test browser).

## Decisions made in Phase 11
1. Look: the attached palette is defined once as theme tokens in `web/src/styles.css` (Deep Black `#0B0B14`, Dark Purple `#17152B`, Card `#25233B`, Neon Purple `#8B5CF6`, Electric Cyan `#00D9FF`, Gaming Orange `#FF6B35`, text `#F8FAFC`; Available `#22C55E`, Pending `#F59E0B`, Occupied `#EF4444`). The existing slate / orange / cyan / emerald scales are remapped to it, so every screen picks it up; primary buttons are orange with dark text, links and highlights cyan, glow and cards purple.
2. Fonts are bundled (Rajdhani for headings, Inter for text), so the installed app still looks right offline. The logo is a drawn controller mark with "E-SPORT GAMING ARENA"; the PWA icons use the same mark. Send a real logo file to replace it.
3. Layout: staff and admin get a sidebar (grouped: Overview, Counter, Setup) on large screens, and on phones a top bar with a menu button, a slide-in menu and a bottom bar (Stations, Bookings, Canteen, Bills; admin: Dashboard first) plus "More". Visitors and customers get a top bar with inline links (a dropdown menu on phones).
4. Landing page (`/book`): hero, four feature tiles, the booking card (unchanged behaviour), and "Our rates". Rates are the real lowest hourly rate per game type from the stations, exposed by `booking_info()` (migration `0011`, rate and type only). The mockup's memberships, passes, tournaments, events, gallery, customers page, bell, search and "maintenance" status were left out because they are not in the spec; "Switched off" (inactive station) takes the orange "maintenance" colour.
3a. Dashboard: four tiles (total stations, active sessions, available now, today's sales), station quick view (green free, red occupied, orange switched off), session summary donut, live sessions (station, customer, start time, played time; no amount shown), quick actions, and the earlier sales, bookings, low-stock, 30-day and busiest-hours blocks.
5. Mobile: every control is at least 44 px tall on touch screens; all routes (public, customer, staff and admin) were checked at 360 px and 1280 px for sideways scrolling and console errors. Lowest text contrast is 4.83:1 (white on the red delete button); everything else is higher.
6. Receipt printing is unchanged (black on white, 58 and 80 mm).
7. Playwright: the staff test opens "More" to reach the Today screen on a phone; the customer test now also works when the test customer already has a profile. The preview dev server had gone stale and kept serving an older build; it was restarted. If screens ever look old, restart it.
8. Not done: a real logo, a light theme, and the mockup's membership and event features.

## Decisions made in Phase 12
1. Passes are v2 (the spec lists a prepaid wallet / loyalty as out of scope for v1). They are sold at the counter only: no online payment, auto-renewal, refunds or pausing.
2. A pass type has a price, validity in days (counted from the sale), a game type (or all games) and either unlimited play or a bundle of hours. Sold passes keep the terms they were bought with (snapshot), so editing a pass type never changes a sold pass. Pass types are never deleted from use (sold passes reference them); they can be switched off.
3. Selling goes through `sell_pass` (staff): customer by phone (counter customer found or created) or by login email (then the pass shows under My bookings). Payments (cash / UPI / card) must equal the price. It writes an ordinary bill (new `pass_total` column, line kind "pass"), so it appears in Bills, sales, payment modes and reports. Reports and the CSV have a Passes column; gaming + canteen + passes - discounts = net sales.
4. Using a pass: Start on a station, look the customer up by phone, pick the pass (`start_pass_session`). One pass runs on one station at a time. Unlimited = gaming charge 0. Hours bundle = played time rounded up to the billing block is taken off the balance; time beyond it is billed at the normal hourly rate; no minimum bill applies. The balance is taken off when the bill is paid (a cancelled session costs nothing). Canteen items are always billed. The gaming line reads "Gaming - PC 1 (Weekly PC pass)".
5. The charge formula changed in `session_charge` (SQL) and `core/pricing.ts` together, with the same numbers in the pgTAP test (16) and the unit tests.
6. Voiding a pass bill cancels the pass; voiding a session bill that used pass hours gives the hours back. Admin can also cancel a pass with a reason (refused while it is in use). Cancelling a pass does not refund money; void its bill for that.
7. Staff can sell and start; only the admin can set up pass types and cancel (RLS and function checks; test 15 and 16).
8. Dashboard shows the count of active passes; the customer's My bookings page lists their passes with hours left and the expiry date.
9. Not built: pass online purchase, a pass for a booked slot (a booking does not need or reserve a pass), expiry reminders, unused-hours refunds.
10. Test passes ("E2E ...") and their customers were removed after the runs; the cleanup order matters (sessions point at passes, passes at bills, bills at sessions).

## Decisions made in Phase 13
1. Images: no image generator is available here, so the pictures are neon SVG illustrations drawn in code (`web/src/app/shared/art.ts`): a gamer at a three-monitor desk (hero), a gaming room with a neon sign (studio section) and a gamer bust (sidebar). They scale to any size, add no files and work offline. They are illustrations, not photographs. To use real photos, put them in `web/public/images/` and replace the art component with an image.
2. "Choose Your Plan" shows only real data: one card per game with its hourly rate, then every active pass (price, validity, unlimited or hours, game type). A pass can carry "Most popular" (tick box in Pass setup). With no passes only the hourly cards show. Pass buttons scroll to the booking card; passes themselves are still bought at the counter and the page says so. `booking_info()` exposes only pass name, price, terms and the flag (migration 0014).
3. Left out of the mockup because they are not features of the app: Experience, Events, Gallery, Contact, Tournaments, Community and "Join Now", notification bell, global search, avatar menu, and the maintenance status (a switched-off station takes its place in orange).
4. Dashboard: the live sessions list shows time played and the amount so far (same pricing formula as the counter and the database); a "Today's highlights" card with real counts; the 30-day sales chart has a soft area fill.
5. The hero text uses the italic display font like the mockup.

## Decisions made in Phase 14
1. The Customers screen lists everyone in the `customers` table: counter and phone customers, and customers who signed in online. Walk-in sessions that only have a typed name and phone are not customers (they stay on their bills). Online logins are still not merged with counter customers by phone number.
2. Search matches part of a name, part of a login email, or at least 3 digits of a phone number (spaces and brackets ignored). The list shows the most recent booker first, with badges for online login, active pass and two or more no-shows.
3. The detail shows counts (bookings, attended, no-shows, cancelled), spend, the passes, up to 50 bookings and the bills tied to the customer (bills of their checked-in bookings and the passes they bought). Spend counts paid bills only; voided bills stay in the list but not in the total.
4. Staff can fix a counter customer's name and phone (the phone must stay unique among counter customers) and keep a private note. A customer who signed in online owns their name and phone; staff can only add a note for them.
5. The staff note is private: `customers.notes` is excluded from the columns that signed-in users may select directly, so neither a customer nor the app can read it from the table; only `customer_detail` (staff) returns it. All other screens select named columns, so nothing else changed.
6. "Book for this customer" opens the booking form pre-filled; "Sell a pass" opens the Passes screen pre-filled (with the login email when there is one).
7. The top bar no longer flashes the signed-out buttons after a page reload: it waits until the stored session has been restored. `CLAUDE.md` and `START-HERE.md` now use the name E-Sports Gaming Arena (the spec keeps its original wording).
8. Found by the 360 px check: the list was 44 px too wide because the grid had no explicit single column on phones; fixed.
9. Known and unchanged: the first-load JavaScript is about 840 kB, over the 500 kB budget warning of the build. Splitting the admin screens into lazily loaded parts would fix it if load time on slow phones becomes a concern.

## Decisions made in Phase 15
1. "Pixel to pixel" is not possible for the pictures: the gamer, the studio photo and the controller in the mockup are painted artwork. They are redrawn as detailed neon SVG illustrations in `web/src/app/shared/art.ts` (hero, studio room, controller, sidebar gamer). Layout, spacing, sizes, colours, fonts, borders and glows follow the mockup section by section. Real artwork can replace the illustrations (put files in `web/public/images/` and swap the component for an image).
2. Sidebar names on desktop follow the mockup: Gaming Systems, Billing & Payments, Inventory, Memberships, Reports & Analytics, Staff Management. The phone bottom bar keeps short names (Stations, Bills, Stock, Passes, Reports). The page title in the top bar uses the long name.
3. Top bar for staff: search box (Ctrl + K) finds customers by name, phone or login email through `customer_list` and opens them on the Customers screen; the bell shows real alerts only (bookings starting within the hour, no-shows today, low stock) and is empty when all is quiet; the avatar menu has the account email and Logout.
4. Visitors and customers: top links Home, The Studio, Plans, Book (and My bookings for a customer), outlined Login, orange Book a Slot. The staff login moved to a small link at the bottom of the page and the phone menu.
5. Landing page: the closing band now has the controller artwork; there is no "Join the community" (not a feature). Plan cards stay centred when there are fewer than four, and show only real rates and passes.
6. Revenue overview: This Week (Monday to Sunday, future days empty), Last 7 days or Last 30 days, with the change against the same number of days before (for a part-week, against the same days of last week). The chart is drawn at the real width of its card so text and dots keep their size on phones. An empty chart shows a 0 to 100 axis.
7. Motion: a gentle float on the hero picture, a rise-in on the welcome heading and hover lift on tiles and quick actions; all switched off for people who ask their device for less motion.
8. The page area is no longer limited to 1152 px for visitors, so the hero can use wide screens; every customer screen sets its own width.

## Decisions made in Phase 16
1. "Live images" are animated SVG scenes drawn in code (`web/src/app/shared/login-stage.ts`), not photos or video: no image files, works offline, scales to any size. Real photos or a looping video can replace the scene later.
2. The banner never shows invented numbers. The customer page shows each game type with its lowest hourly rate from `booking_info` (e.g. "PC from ₹60/h"); if that cannot load, it shows plain facts. Live free-station counts would need a new public function, so they were left out.
3. All movement is CSS and stops completely when the device asks for less motion (tested).
4. On phones the banner is a short strip above the form; checked at 360, 768 and 1280 px with no sideways scroll.
5. The show/hide button is outside the password label and named "Show typed characters", so screen readers and `getByLabel('Password')` still find only the field.
6. No database change and no new migration; login logic is unchanged.
7. Test data note: the customer e2e spec (`first booking`) expects an empty bookings table. After a failed run, remove the leftover E2E bookings/customers (the cleanup SQL used in earlier phases) before running it again.

## Decisions made in Phase 17
1. One owner email for every service: Supabase, GitHub, Cloudflare (and Resend). The old Supabase project (`rfwozldwehmtjvgqpvid`) is no longer used; delete it when the new one is confirmed.
2. The new project was built with `supabase db push --remote` (CLI login by the owner; no database password was needed). Nothing was copied from the old project because it held only test data.
3. The owner login is `esport.gamingarena12@gmail.com`; the staff login uses the email the owner used before. Both were created by the owner in the dashboard so passwords never passed through chat.
4. Stations follow the printed rate card: 5 PC and 3 PS5. Hourly rates are the card's 1-hour prices (PC 90, PS5 110) and are what time beyond a package is billed at. Every other card price is a fixed-price package (PC 30 min / 1 h; PS5 1 to 4 players, 30 min / 1 h), 10 in all; the three starter packages are hidden. Overtime on a PS5 package uses the 1-player rate even for 2 to 4 players. The food menu from the card (Sweet Corn Pizza 150, Veg Pizza 120, Veg Sandwich 50, Corn Sandwich 60, Samosa 15) replaced the starter snacks, which are hidden; each starts at 20 in stock (a guess, edit in Stock).
5. Buttons: primary actions use a violet-to-fuchsia gradient with white text; selected chips and the "Most popular" tag match.
6. The Edge Function reads `RESEND_API_KEY` only when it starts, so after changing the secret redeploy the function (run Supabase commands from the project folder `egaming-era-starter/egaming-era-starter`, not its parent). A 401 `API key is invalid` in `booking_emails.error` means the key itself is wrong.
7. Still the owner's: `RESEND_API_KEY` secret, SMTP in Supabase Auth, Site URL / Redirect URLs, a verified sending domain in Resend, test logins for the browser tests, deleting the old project.

## Decisions made in Phase 18
1. Prices for the daily pass and the monthly plan were not given, so none are on the site. The owner creates them in Admin > Memberships: a daily pass is a pass valid for 1 day (its card says "Subject to seat availability"; it does not reserve a seat); a monthly plan is valid for 30 days with a usual price, which shows a crossed-out price and "Save n%". Any number of customers can buy the same pass.
2. The rate card is built from the active fixed-price packages, grouped by name ("PS5 2 Players 30 Min" and "... 1 Hour" share the row "PS5 2 Players"). A package whose name has no length ("PC 1", "PC 2") joins its game's row ("PC"), so the card still reads correctly.
3. Opening hours are data (the `opening_hours` table), so the owner can change them in Admin > Booking settings; booking availability and the home page both read the same rows.
4. Food photos: the owner uploads their own (JPG, PNG or WebP, up to 2 MB; large phone photos are shrunk in the browser first). Items without a photo show a letter tile. Delete removes an item that was never sold (and its photo); an item with sales, wastage or an open tab is only switched off so old bills and reports stay correct.
5. Time up: a package session rings when its package minutes are used up; an hourly or pass session rings after the timer chosen when it was started. The pop-up is mounted for signed-in staff and admins on every screen and plays a beep every 8 seconds until dismissed. Extend only moves the reminder (billing is unchanged); Stop timer ends the session so it can be billed on Stations; Dismiss hides it for this browser session. Pass sessions can have a timer, but a pass running out of minutes does not ring on its own.
6. Not verified live yet: the admin screens (pass discount form, food photos, delete) and the pop-up need the e2e test logins in the new project; `web/e2e/shop-updates.spec.ts` has the tests and skips itself until the admin test account exists.

## Phase 18b: home page highlights (migration 0017)
1. "Choose Your Plan" repeated the rate card (PC 90/h and PS5 110/h next to the same prices in the table), so the plan cards now show passes only, under "Play more, pay less". Hourly and package prices live in one place: the rate card. The nav link and hero button are "Rates" / "View Rates".
2. Timings show a live status in India time ("Open now · closes 10:00 pm", "Opens tomorrow at 12:00 pm") and highlight today's row.
3. Canteen: the home page shows the facility, the categories on offer and up to 6 items (photo and price), not the whole menu. The owner chooses them with "Show on the home page" in Admin > Products; featured items come first, then the rest by category and name, and only items that are active and in stock are shown. Visitors still cannot read the products table: `booking_info()` returns only name, price, category and photo.
4. Fixed: opening `/book#rates` (or clicking Rates before the data had loaded) did nothing because the section was not on the page yet; the page now scrolls to the section once the data arrives.
5. Tests: 17 new pgTAP checks (test 19, all pass, rolled back), 203 unit tests, public Playwright checks (rate card, open status, canteen, 360 / 768 / 1280 px).
6. Note: with several categories the default fill (no featured items) lists the first six by category name, so it can show only drinks. Tick "Show on the home page" on the items you want to show. Categories "Drink" and "Drinks" are separate in the data; merge them in Admin > Products if you want one chip.

## Phase 19: home page slider
1. The hero is a slider (`shared/hero-slider.ts`, position and swipe rules in `shared/slider-utils.ts`). Slide 1 is the existing welcome hero, kept as it was. Slides 2 to 4 follow the order the owner asked for: Games available, Timings, Canteen facility.
2. The slides use live data, so they stay right when prices, hours or items change: games show "From ₹x / 30 min" from the cheapest shortest package (else the hourly rate); timings show the live open status and today's row with a neon clock; the canteen slide shows up to 4 of the highlighted items (the same ones as the Canteen section, set with "Show on the home page" in Admin > Products). A slide with nothing to show is left out.
3. Behaviour: auto-play every 7 seconds, paused while the pointer or keyboard focus is on the slider; swipe left/right on a phone; previous/next buttons, dots and the left/right arrow keys; wraps from the last slide to the first instantly instead of rewinding across all slides. Slides not showing are hidden from screen readers and Tab. With "reduce motion" there is no auto-play and no sliding, only the buttons.
4. The Games, Timings and Canteen sections further down the page are unchanged, so the same facts appear in both places for now. Remove either if you prefer one.
5. The slider is as tall as its tallest slide (the welcome slide with its picture), so on a phone the shorter slides have extra room around them.

## Phase 20: games list and coming-soon ticker
1. The owner lists games in Admin > Games: title, played on (all games, PC or PS5), status (Available now or Coming soon), Hot and New flags, an optional release date and note for coming-soon games, an optional poster (JPG, PNG or WebP up to 2 MB, shrunk in the browser first), an order number and a show/hide switch. Titles are unique whatever the capital letters (migration 0019 after the first test run showed \"GTA V\" and \"gta v\" were both accepted).
2. A starter list was loaded by migration 0018 (Valorant, Counter-Strike 2, GTA V, Fortnite, Apex Legends, Dota 2, EA Sports FC, Tekken 8, God of War Ragnarök, Marvel's Spider-Man 2, Gran Turismo 7, and GTA VI as coming soon with no date). They are well-known titles chosen as a starting point, not a record of what is installed: edit them in Admin > Games.
3. Home page: slide 2 (Games available) shows up to 8 games as posters (hot first, then new, then the order number), with a filter for All / PC / PS5 that shows the starting price of each type; a game on every platform appears under each filter. A game without a poster shows a coloured tile with its first letter. If no games are listed at all, the slide falls back to the PC and PS5 price tiles. The \"Book a Gaming Slot\" button on that slide opens booking with the chosen filter.
4. The ticker strip at the top of the home page lists coming-soon games (with release date and a countdown such as \"in 3 days\", or the owner's note, or \"Coming soon\") and then games marked New. It repeats enough copies to look continuous even with one game, scrolls at a steady pace, pauses on hover, focus and touch, and for people who ask for less motion it is a static wrapped line. It is hidden when there is nothing to show. It appears on the home page only.
5. Visitors can read games only through `booking_info()`; the games table itself is staff-read, admin-write. The Games, Timings and Canteen sections lower on the page are unchanged.
6. Build size: with the games and ticker the first download grew past the build's hard 1 MB limit (a push would have failed to deploy). The screens behind a login (admin, counter, the customer's own bookings) are now loaded only when opened (`loadComponent` in `app.routes.ts`), so a visitor's first download dropped from about 1.01 MB to 773 kB (181 kB transferred) and the limit is no longer hit. The login guards are unchanged and the service worker still caches every piece for offline use. The long-standing warning (over 500 kB) remains.
7. Not verified live: adding, editing and deleting a game in Admin > Games (and uploading a poster). `web/e2e/games.spec.ts` has the test and skips itself until the admin test account exists in the project.

## Phase 21: Google sign-in for customers
1. Why: email codes only reach customers once a sending domain is verified in Resend; Google sign-in needs no email, so it works for everyone straight away.
2. Flow: \"Continue with Google\" -> Supabase `signInWithOAuth` (Google, with `prompt=select_account`) -> Google -> back to `<site>/book/login`. The page the customer wanted (`next`) is kept in session storage (`google-login-pending`, valid 10 minutes) because the page reloads on the way. On return `BookLogin` finishes the sign-in and uses `afterLoginPath` (`core/google-login.ts`), the same routing as the email code: staff and admins go to their own area, a customer with no saved name and phone goes to /book/profile first, otherwise to `next` or My bookings. A cancelled or failed return shows a message (`oauthErrorFrom`).
3. The profile is created from Google's name and email by the existing signup trigger, so the name is already filled in on the details page. A customer who used an email code before and then signs in with Google using the same address gets the same account (Supabase links verified emails), so their bookings carry over.
4. Before sending the customer to Google the app checks that Supabase answers; if Google is not switched on yet (HTTP 400) the customer sees \"Google sign-in is not switched on yet. Please use an email code instead.\" instead of a blank error page.
5. Staff and admin keep the email and password login (`/login`); nothing changes there.
6. Owner setup, in this order (the client secret is typed by the owner into Supabase, never shared):
   - Google Cloud Console: create a project; APIs & Services > OAuth consent screen > External, app name \"E-Sports Gaming Arena\", support email, then **Publish app** (status In production; while it says Testing only listed test users can sign in; the basic name and email scopes need no Google review).
   - APIs & Services > Credentials > Create credentials > OAuth client ID > Web application. Authorised redirect URI: `https://cwioasxspzutwglvnthl.supabase.co/auth/v1/callback`. Authorised JavaScript origin: the site address (`https://e-sports-gaming-arena.pages.dev`).
   - Supabase > Authentication > Sign In / Providers > Google: enable, paste the Client ID and Client secret, save.
   - Supabase > Authentication > URL Configuration: the Site URL and the Redirect URLs (`https://e-sports-gaming-arena.pages.dev/**`) are already set; add `http://localhost:4200/**` for local testing (already there) and any custom domain later.
7. Not verified: a real Google sign-in end to end (needs the setup above). Everything up to the hand-off and the return handling is covered by tests.

## Phase 22: email sign up and sign in for customers
1. The customer login (`/book/login`) leads with Continue with Google, then \"or with your email\" and two tabs. Create account asks for Full name, Email, Password and Confirm password with Remember me ticked by default; Sign in asks for Email and Password with the same checkbox and a show/hide button. Staff and admin keep `/login` (email and password, no change).
2. Password rule (`core/password-login.ts`, unit tested): at least 8 characters, at most 72 bytes (Supabase stores only the first 72), letters and at least one number, and not the email or the part before the @. The Create account button stays disabled until the name, email, password and an identical confirmation are valid; a mismatch is shown as soon as the confirmation is typed.
3. The name is saved with the account (`full_name` in the sign-up data) and the existing signup trigger puts it on the profile, so the \"Your details\" page already shows it and only asks for the phone. A customer with a password who later signs in with Google using the same address gets the same account.
4. **Supabase setting needed:** with \"Confirm email\" ON (Authentication > Sign In / Providers > Email), a new account gets no session until the confirmation email is opened, and those emails cannot reach customers until a sending domain is verified in Resend. The app handles both: signed in at once when it is OFF; when it is ON the customer is told to check their inbox and the sign-in tab opens with the email filled in. To let customers sign up today, switch Confirm email OFF. Trade-off: anyone can then register with an email address they do not own; they only get a customer account, and an address that really belongs to someone is still protected because that person signing in with Google replaces an unconfirmed password account for the same address. Switch it back ON once the Resend domain is verified.
5. Remember me: unticked, the customer is signed out when the browser is closed. The choice is stored as `remember-me` in local storage and a per-session marker `session-alive` in session storage; at start-up `shouldEndSession` signs out when the choice is \"0\" and the marker is gone. Google and email-code sign-ins are always remembered. This applies only to sign-ins made with the new password forms.
6. No forgotten-password flow (it would send an email that cannot be delivered yet): the form says to sign in with Google or an email code instead. Add one once the Resend domain is verified.
7. Not verified: a real sign up and sign in against the live project (creating real accounts was avoided); every request, error message and the remember-me start-up behaviour are covered by stubbed browser tests and unit tests.

## Phase 23: the emailed code is gone
1. The owner chose Google sign-in plus a simple sign up and sign in with email and password, so the 6-digit email code was removed from the customer login (page, auth service methods `requestOtp` / `verifyOtp`, and the messages that mentioned it). Decision D1 in `docs/spec.md` records the change.
2. Supabase still has its magic-link / email one-time-code endpoint switched on for the project (the Email provider's own setting); the app no longer uses it. To close it as well, switch off \"Allow users to sign in with a magic link or one-time password\" in Authentication > Sign In / Providers > Email.
3. Forgotten password: there is still no reset flow (it would send an email that cannot be delivered until the Resend sending domain is verified). The sign-in tab says to sign in with Google instead. Add a reset flow once the domain is verified.

## Phase 24: the owner's real games list and posters from the list
1. The starter games (my guesses) were replaced by the owner's list, entered on 2026-11-16: PS5 Call of Duty: Modern Warfare II, Call of Duty: Modern Warfare IV, Mortal Kombat, WWE 2K26, Marvel's Spider-Man 2, FIFA 27, God of War; PC PUBG: Battlegrounds, Valorant, Free Fire, Asphalt. The order alternates PC and PS5 so both show among the first eight on the home page; none is marked Hot or New (the owner ticks those in Admin > Games). GTA VI stays as coming soon with no date. The same list is in `supabase/seed.sql`.
2. Titles were typed exactly as written on the owner's list. \"Call of Duty: Modern Warfare IV\" and \"FIFA 27\" are not titles the author could verify; check the spelling and edit them in Admin > Games if needed.
3. Posters: Admin > Games now has an **Add poster / Change poster** button on every game's row (a \"no poster yet\" hint shows where one is missing) as well as in the edit form. Choosing a file uploads it at once: it is made smaller in the browser, stored in the `game-images` bucket, attached to the game, and an old poster file is removed. On a phone use Edit > Add poster.

## Phase 25: deleted products leave the Stock screen
1. Migration `0020_product_deleted.sql` adds `products.deleted_at`. `delete_product` still removes a never-sold item for good; an item with sales history is now marked deleted (and switched off and taken off the home page) instead of staying listed as "inactive".
2. Admin > Products, Counter > Stock and the low-stock alert leave deleted items out. Bills and reports still show their names. An item that is only switched off (not deleted) still shows as inactive so it can be switched back on.
3. Test: `supabase/tests/21_product_deleted.test.sql`.

## Phase 26: counter fixes
1. Counter > Bookings day grid: past time slots now say **Used** (a session ran on that station then; hover for the name and times) or **Vacant** (nobody used it), instead of an empty dark box. Based on the sessions table, so walk-ins count.
2. Admin screens (Stations, Packages, Passes, Products, Games): Edit and + New scroll up to the form; every list row has Delete (hides instead when the item has history) and, where it applies, Make inactive / Make active.

## Phase 27: no Pause/Resume, Extend, and more time at Start
1. Counter > Stations: the Pause and Resume buttons are gone (the database functions stay for old data). A running card has **Extend**, Stop, + Items, Bill (and Cancel for the admin).
2. **Extend** (migration `0021_extend_session.sql`, function `extend_session`): for a package session the chosen package is added, so its minutes and its price are added to the session (30 min Rs 50 + 60 min Rs 90 = 90 min, Rs 140). The formula in `session_charge` and `pricing.ts` is unchanged: fixed price inside the minutes, overtime beyond. For a per-hour session the bill still follows the time actually played; Extend (+30/60/90/120 min) sets or moves the "time is up" reminder to that many minutes from now. A stopped-but-not-billed session is brought back to running first (the gap is not charged). Pass sessions cannot be extended.
3. **Start**: Per hour or a package, and "How many (for more time)": 2 x 60 min = 2 hours at twice the price, done by starting the package and extending with the same package.
4. Tests: `pricing.spec.ts` (extended package), `extend-dialog.spec.ts`, `supabase/tests/22_extend_session.test.sql`, `e2e/extend-session.spec.ts` (skips without the staff/admin test logins).

## Phase 28: customers list loads as you scroll
1. Migration `0022_customer_list_paging.sql`: `customer_list(p_search, p_limit, p_offset)`; the defaults (200 and 0) keep the top-bar search and old tests working; the order is now fixed (last booking, name, id) so pages never overlap; the limit is capped at 500.
2. Counter > Customers asks for 50 at a time and adds the next 50 when the list is within about 240 px of its bottom (or when "Load more" is pressed). A new search throws away a page that was still loading. The count shows "50+ customers" until the last page, then "All customers shown".
3. Tests: `customer-utils.spec.ts` (paging helpers), `supabase/tests/23_customer_paging.test.sql` (run it in the dashboard SQL editor: it needs the pgTAP extension lines).

## Phase 29: Unbilled screen
1. New **Counter > Unbilled** (staff and admin, `/counter/unbilled`): every session not yet paid, stopped ones first ("Stopped - not billed") then ones still running (for a customer who left without Stop), each with gaming charge, canteen items on its tab and the total. **Bill now** stops the timer if needed and opens the usual checkout, so a bill can be made at any time.
2. The bell shows "N stopped sessions not billed yet"; the admin dashboard has an Unbilled card with the count.
3. Dashboard highlights also count today's sessions (walk-in and booked), see Phase 26 notes.
4. Not covered by an automated browser test (needs the staff/admin test logins in this project).

## Phase 30: change password for admin, staff and customers
1. New screen `/account/password` (any signed-in person). A **Change password** link sits just above **Logout** in the staff and admin account menu (top bar, and the side menu on phones) and in the customer top bar (and the phone menu). The account must give its current password, which is checked by signing in with it; a Google-only account has no password yet and can just set one. The new password follows the same rules as sign up (8 to 72 bytes, letters and a number, not the email), must differ from the old one and be typed twice.
2. No database change: Supabase's own `updateUser` changes the password. Not tested against a real account (so no real password is touched); the rules are unit tested and the guard (a visitor is sent to the login page) has a browser test.
3. Note for testing: port 4200 on the author's PC was taken by a different project, so browser tests were run on port 4300.

## Phase 31: pending bills live on the Bills screen
1. The separate Unbilled menu item and screen are gone (the old address `/counter/unbilled` now opens Bills). **Counter > Bills** has a status filter: **All, Pending, Paid, Void**, with counts.
2. The words: **Pending** = yet to be billed (a stopped session nobody has paid for, or a session still running), **Paid** = billed and paid (green PAID chip on each bill), **Void** = a cancelled bill. Pending sessions are shown whatever date is picked, at the top, with the gaming charge, canteen items and a **Bill now** button; the date picker applies to the paid and void bills.
3. The bell says "N stopped sessions pending payment" and opens Bills; the admin dashboard card is "Pending bills".

## Phase 32: staff land on their dashboard; no more blank screens after a deploy
1. A signed-in admin or staff member who opens the site (`/` or `/book`) is sent to their own dashboard instead of seeing the public page mixed with their menus. **View public site** (bottom of the side menu, opens `/book?preview=1`) shows the public page on purpose in the normal top-bar layout, with a **Back to dashboard** button. Customers and visitors are not affected.
2. Blank screen on a screen such as `/counter/stock` after a new version was deployed: an old copy of the app (open tab or cached by the service worker) asked for a screen file whose name had changed. Now (`core/app-update.ts`): the app checks for a new version when the tab comes to the front and every 15 minutes; when one is ready, the next screen the person opens is loaded fresh; and if a screen file still cannot be loaded the page reloads once (never in a loop). Needs one hard refresh to pick up this fix on a browser that is already stuck.

## Phase 33: Bills loads 10 at a time
Counter > Bills asks for the first 10 bills of the picked date and adds 10 more when the end of the list scrolls into view (or when "Load more bills" is pressed). The status filter (All / Paid / Void) is applied by the database, and the Paid and Void counts on the filter buttons come from counts for the whole day. The one-minute refresh keeps as many bills as are already on screen, so a list you scrolled down does not jump back to 10. Pending sessions are not paged (there are few).

## Phase 34: overtime grace on package sessions
1. Migration `0023_overtime_grace.sql`: `settings.overtime_grace_min` (10), copied to each session at start; `sessions.overtime_mode` (null automatic, 'charge', 'waive'); `session_charge()` and its mirror in `pricing.ts` changed together. On a package session, time past the package is free while it is within the grace (up to and including 10 minutes) unless staff choose to charge it; beyond the grace it is charged in billing blocks (11 to 15 min over = one 15 min block, 16 to 30 = two) unless staff choose not to. Per-hour and pass sessions are unchanged. A session with no grace value (the old golden rows) behaves exactly as before, so the golden test still passes.
2. Counter: the station card and the Pending list show "Overtime N min, charged / not charged" with **Charge overtime (+Rs x)** and **Don't charge** buttons (and **Automatic** to undo). Admin > Settings has "Overtime grace (minutes)".
3. Tests: `pricing.spec.ts` (grace cases, overtimeState), `supabase/tests/dashboard/24_overtime_grace.sql` (run in the dashboard SQL editor; rolls itself back).
4. Open sessions at the time of the migration got the grace of 10 minutes (the column default).

## Phase 35: staff can type the overtime amount (inside the grace)
Migration `0024_overtime_amount.sql`: `sessions.overtime_amount` and `set_overtime_mode(session, mode, amount)`. While overtime is within the grace (10 minutes to start with) and staff chose Charge, the amount they type replaces the block price (6 min over with Rs 10 typed = package + Rs 10; Rs 0 is allowed). Beyond the grace the normal block charge takes over, so a long overtime is never undercharged by a small typed amount. Plain **Charge overtime** clears a typed amount, **Don't charge** and **Automatic** clear it too. `pricing.ts` mirrors the SQL (`customOvertimePaise`). The control on the station card and the Pending list has an "or charge ₹ [amount] Set" box, shown only inside the grace. Tests: `pricing.spec.ts` and the extra cases in `supabase/tests/dashboard/24_overtime_grace.sql`.

## Phase 36: audit of the money and time calculations
Checked: the deployed `session_charge` source against migration 0024 (identical); `pricing.ts` against it (same rules: package, grace, staff choice, typed amount, blocks, pass, per hour; the old 138-row golden table still matches); `checkout_bill` (the server recomputes the gaming charge at the frozen `ended_at`, the payments must equal the total to the paisa, the discount cannot exceed the subtotal, nothing is written when validation fails); time handling (server clock offset on every screen, IST day ranges for Bills and the dashboard, paused time removed, frozen `ended_at` for stopped sessions).
Fixed: (1) Extend now clears an earlier overtime choice (migration `0025_extend_resets_overtime.sql`), so an old Don't charge or typed amount cannot silently apply to the new, longer time. (2) When a typed overtime amount has run past the grace, the card says so ("no longer applies ... block charge is on the bill") instead of changing the amount without explanation.
Open (not changed, needs a decision): a session left running after the customer went home is billed up to the moment staff press Bill; there is no way to set the real end time. The receipt shows one gaming line, with no separate overtime line.

## Phase 37: customer left earlier (set the real end time)
Migration `0026_session_end_time.sql`: `set_session_end_time(session, end, reason)` and the append-only `session_end_log` (who, when, from, to, reason; staff can read it, nobody can edit or delete it from the app). The database refuses an end time before the start (plus any uncounted time) or in the future, a blank reason, and a billed or cancelled session; a correction stops the session at that time. Counter: **Left earlier?** on a station card and **Customer left earlier? Set end time** on each Pending bill open a window with the India-time box, a required reason and a live price preview (same overtime rules). Bills: an **End time corrected** badge and, when the bill is opened, who changed it, from what to what and why. Staff and admin can both use it. Tests: `end-time.spec.ts` (helpers and preview), `supabase/tests/dashboard/25_end_time.sql` (limits, audit log, permissions; run in the SQL editor).
The Bills screen asks for `session_end_log`, so migration 0026 must be applied before this version is deployed.

## Phase 38: Undo stop
Migration `0027_undo_stop.sql`: `undo_stop_session(session)` resumes a session that was stopped by mistake and not yet billed. It carries on as if never stopped: the time since the Stop counts as played (so it is not the old `reopen_session`, which leaves the gap out and is no longer offered). It is written to `session_end_log` ("Stop undone") and shown on the bill. Counter: **Undo stop** on a stopped station card and on a stopped Pending bill. Test: `supabase/tests/dashboard/26_undo_stop.sql` (also checks that stopping or resuming one session does not touch another).
Reported at the same time and not yet found: stopping a forgotten running session affected another running session. The server functions work on one session id, the screens pass the id of the card or row, and the live data is consistent; waiting for the exact steps to reproduce it.

## Phase 39: tidier station card
All the information stays visible, stacked in tidy blocks: the big timer and price, a label / value box (Customer, Package, Time left or Overtime, Timer, Tab), the overtime panel (status line, Charge / Don't charge side by side, your own amount), then **Bill** on its own wide row and a two-column grid (Extend, Stop or Undo stop, + Items, Left earlier?, Cancel session). Checked on a desktop and a 390 px phone with a fake backend (not the live one).

## Phase 40: stations in use first
Counter > Stations lists the stations that have a session (running, or stopped and not billed) first and the unused ones after them, and the cards fill the screen like bricks (`layout.ts`): each card goes into the shortest column, so with two busy stations the unused ones stack in the free third column, and when a third session starts it takes that column and the unused ones move down under the others. 1 column on a phone, 2 on a tablet, 3 on a wide screen. Checked on a desktop width with a fake backend.

## Go-live clean-up (2026-11-19)
Before going live the test activity from before 19 Nov (India time) was deleted from the live project with `supabase/maintenance/clear_test_data_2026-11-19.sql` (one transaction): 15 bills, 29 bill lines, 14 payments, 44 sessions, 14 tab items, 3 bookings. Kept: all accounts, customers, stations, packages, pass types, products, stock counts and stock history (its link to the deleted bills cleared), games, settings, opening hours, booking rules, and today's 2 running sessions. Bill numbers were restarted so the first real bill is #1. A read-only copy of every table was saved first in `backups/` on the owner's PC (git-ignored, contains personal data). To do by hand: stop or cancel the 2 test sessions that were running, and correct the stock counts under Inventory before opening.

## Open items / to do later
- Add real photos or the shop's logo when available (see Phase 13 decision 1).
- Phase 10 acceptance still open: installs on Android and iPhone; production end-to-end. The 1-hour reminder email itself was proven by pgTAP only (a live one needs a booking starting within the hour).
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
