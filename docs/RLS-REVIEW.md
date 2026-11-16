# RLS review (Phase 10)

Checked live against the dev project on 2026-11-11 (policies, table privileges, function grants) and locked in by
`supabase/tests/15_rls_review.test.sql` (47 checks, extended for passes in Phase 12). Result: **no gaps found, no fix needed.**

Roles: **Visitor** = not signed in (anon). **Customer** = signed in, not staff. **Staff** = active staff.
**Admin** = active admin. Staff rights include admin's read rights; "is_staff()" means staff or admin.

## Tables

| Table | Visitor | Customer | Staff | Admin |
| --- | --- | --- | --- | --- |
| profiles | none | select own | select own | select all, **update** all |
| settings | none | none | select | select, update |
| booking_settings | none | none | select | select, update |
| opening_hours | none | none | select | select, update |
| stations | none | none | select | select, insert, update, delete |
| packages | none | none | select | select, insert, update, delete |
| products | none | none | select | select, insert, update (no delete) |
| stock_moves | none | none | select | select |
| sessions | none | none | select | select |
| tab_items | none | none | select | select |
| bills | none | none | select | select |
| bill_items | none | none | select | select |
| payments | none | none | select | select |
| pass_types | none | none | select | select, insert, update, delete |
| customer_passes | none | select own | select all | select all |
| customers | none | select own (not the staff note) | select all (not the staff note) | select all (not the staff note) |
| bookings | none | select own | select all | select all |
| booking_emails | none | none | none | none (server only) |
| mail_config | none | none | none | none (server only) |

"none" = the role has no privilege, or RLS returns no rows. Every table has RLS on. Nobody can insert, update or
delete bills, payments, stock, sessions, bookings or customers directly: those change only through functions.
No table has a policy for visitors.

## Functions (what the app may call)

| Callable by | Functions |
| --- | --- |
| Visitor | `booking_info`, `get_availability` (free counts only) |
| Customer (own data only, checked inside) | `save_my_profile`, `my_bills`, `my_passes`, `create_booking`, `cancel_booking`, `reschedule_booking`, `get_reschedule_availability` |
| Staff and admin | `start_session`, `pause_session`, `resume_session`, `end_session`, `reopen_session`, `cancel_session`, `add_tab_item`, `remove_tab_item`, `checkout_bill`, `stock_move`, `recent_stock_moves`, `check_in_booking`, `mark_no_show`, `server_now`, `today_report`, `sell_pass`, `start_pass_session`, `lookup_passes`, `customer_list`, `customer_detail`, `update_customer` |
| Admin only (checked inside) | `void_bill`, `cancel_pass`, `dashboard_today`, `sales_trend`, `busy_hours`, `sales_report` |
| Nobody from the app | `promote_admin`, `session_charge`, `release_no_shows`, `resolve_customer`, `station_free`, `station_busy_until`, `check_booking_window`, `availability_rows`, `report_core`, `run_booking_mail`, and the trigger functions |

`is_admin()` and `is_staff()` are callable by signed-in users (they only answer for the caller).

The staff note on a customer (`customers.notes`) is excluded from the columns that signed-in users can select, so it can be read only through `customer_detail` (staff). Test 17 checks this.

## Edge Functions

- `admin-create-staff`: needs a signed-in, active admin; uses the secret key server-side only.
- `send-booking-email`: needs the `x-mail-secret` header; sends only emails already queued by the database.

## How it was checked

1. Policy, privilege and function-grant listings from the live database (this table).
2. Behaviour tests as customer, staff and visitor (`15_rls_review.test.sql`): no self-promotion, no direct writes,
   no reading of other people's data, admin-only functions refuse everyone else.
3. Earlier phases have their own refusal tests (02, 03, 06, 09, 10, 11, 12, 13, 14).
4. The built web app is scanned for any key other than the public anon key (`npm run check:keys`).


## Phase 18 additions (checked by `supabase/tests/18_shop_updates.test.sql`)

- Storage bucket `food-images`: public read by link, 2 MB limit, JPG/PNG/WebP only. Policies on `storage.objects`: only an admin can insert, update or delete files in this bucket (staff and visitors are refused).
- `delete_product(bigint)`: admin only (staff and visitors get `42501`); a product with sales history is switched off, never removed.
- `set_session_alarm` / `extend_session_alarm`: staff and admin only; visitors get `42501`. They change only the reminder columns, never billing.
- `booking_info()` is public by design and now also returns the opening hours, the active packages and a pass's usual price. It exposes nothing about customers, sessions or sold passes.
- Phase 18b (`supabase/tests/19_home_highlights.test.sql`): `products.featured` can be changed only by the admin (column grant plus the existing admin-only update policy). The public canteen block lists only active items that are in stock or not stock-tracked, at most 6, and exposes only name, price, category and photo path (never stock counts); visitors still get `42501` on the products table.
- Phase 20 (`supabase/tests/20_games.test.sql`): `games` is unreadable and unwritable for visitors (`42501`), readable but not writable for staff (their updates and deletes affect no rows), and fully writable only by the admin. The public lists come from `booking_info()` only, expose just title, platform, Hot/New flags, release date, note and poster path, and are capped at 24 and 10 entries. The `game-images` bucket is public to read, 2 MB, and admin-only to write (staff and visitors are refused).
