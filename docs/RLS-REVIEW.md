# RLS review (Phase 10)

Checked live against the dev project on 2026-11-11 (policies, table privileges, function grants) and locked in by
`supabase/tests/15_rls_review.test.sql` (32 checks). Result: **no gaps found, no fix needed.**

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
| customers | none | select own | select all | select all |
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
| Customer (own data only, checked inside) | `save_my_profile`, `my_bills`, `create_booking`, `cancel_booking`, `reschedule_booking`, `get_reschedule_availability` |
| Staff and admin | `start_session`, `pause_session`, `resume_session`, `end_session`, `reopen_session`, `cancel_session`, `add_tab_item`, `remove_tab_item`, `checkout_bill`, `stock_move`, `recent_stock_moves`, `check_in_booking`, `mark_no_show`, `server_now`, `today_report` |
| Admin only (checked inside) | `void_bill`, `dashboard_today`, `sales_trend`, `busy_hours`, `sales_report` |
| Nobody from the app | `promote_admin`, `session_charge`, `release_no_shows`, `resolve_customer`, `station_free`, `station_busy_until`, `check_booking_window`, `availability_rows`, `report_core`, `run_booking_mail` |

`is_admin()` and `is_staff()` are callable by signed-in users (they only answer for the caller).

## Edge Functions

- `admin-create-staff`: needs a signed-in, active admin; uses the secret key server-side only.
- `send-booking-email`: needs the `x-mail-secret` header; sends only emails already queued by the database.

## How it was checked

1. Policy, privilege and function-grant listings from the live database (this table).
2. Behaviour tests as customer, staff and visitor (`15_rls_review.test.sql`): no self-promotion, no direct writes,
   no reading of other people's data, admin-only functions refuse everyone else.
3. Earlier phases have their own refusal tests (02, 03, 06, 09, 10, 11, 12, 13, 14).
4. The built web app is scanned for any key other than the public anon key (`npm run check:keys`).
