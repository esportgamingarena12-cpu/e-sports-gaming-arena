# Progress

| Phase | Name | Status | Date | Notes |
| --- | --- | --- | --- | --- |
| 0 | Project setup | Done | 2026-11-10 | Angular 21 + Tailwind shell in web/, supabase/ folders. `supabase init` not run yet. |
| 1 | Database: core and billing | Done (verified on hosted dev project) | 2026-11-10 | Migrations 0001/0002 + seed applied; 51 pgTAP checks pass on Supabase project rfwozldwehmtjvgqpvid (no Docker). |
| 2 | Auth and roles | Not started | | |
| 3 | Admin settings | Not started | | |
| 4 | Counter: stations | Not started | | |
| 5 | Canteen and stock | Not started | | |
| 6 | Checkout and receipts | Not started | | |
| 7 | Bookings | Not started | | |
| 8 | Customer portal | Not started | | |
| 9 | Dashboard and reports | Not started | | |
| 10 | Notifications, PWA, deploy | Not started | | |

## Decisions made in Phase 1 (answers to open questions)
1. Sessions snapshot rate, billing block and minimum bill at start.
2. Time between Stop and Reopen counts as paused (not charged).
3. Tab items reserve stock (checked against all open tabs); stock deducts only at checkout.
4. bill_no is a plain incrementing integer; failed checkouts do not consume numbers.
5. A zero-total bill is allowed (e.g. fully discounted) with no payment rows.
6. A session in status `ended` (not yet billed) still blocks a new session on that station.
7. Seed prices: Maggi 50, Coffee 40 (Phase 6 example: 180 + 2x50 + 40 - 5 = 315).

## Open questions
- Seed prices for Cold Drink, Chips, Water, Sandwich were chosen by me; adjust in Settings later.
- Phase 2 will add a trigger creating profiles on signup; Phase 1 tests insert profiles with ON CONFLICT so they keep working.

## To verify Phase 1 (once Docker + Supabase CLI are installed)
```
cd supabase
supabase init        # keep existing folders
supabase start
supabase db reset    # run twice
supabase test db
```
