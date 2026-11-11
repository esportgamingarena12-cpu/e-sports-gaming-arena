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
| 7 | Bookings | Not started | | |
| 8 | Customer portal | Not started | | |
| 9 | Dashboard and reports | Not started | | |
| 10 | Notifications, PWA, deploy | Not started | | |

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

## Open items / to do later
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
