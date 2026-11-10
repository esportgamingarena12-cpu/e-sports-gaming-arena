# Progress

| Phase | Name | Status | Date | Notes |
| --- | --- | --- | --- | --- |
| 0 | Project setup | Done | 2026-11-10 | Angular 21 + Tailwind shell in web/, supabase/ folders. `supabase init` not run yet. |
| 1 | Database: core and billing | Done (verified on hosted dev project) | 2026-11-10 | Migrations 0001/0002 + seed applied; 51 pgTAP checks pass on Supabase project rfwozldwehmtjvgqpvid (no Docker). |
| 2 | Auth and roles | Done (verified on hosted dev project) | 2026-11-10 | Migration 0003 (11 pgTAP checks), Edge Function admin-create-staff, guards, staff and customer login. Browser-verified. |
| 3 | Admin settings | Not started | | |
| 4 | Counter: stations | Not started | | |
| 5 | Canteen and stock | Not started | | |
| 6 | Checkout and receipts | Not started | | |
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

## Open items / to do later
- **Resend limits (Phase 10):** `onboarding@resend.dev` only delivers to the Resend account owner's address. Verify a sending domain in Resend before real customers use the booking site, and replace the SMTP sender.
- **Rotate the Resend API key** that was shown in chat during setup (create a new key, update it in Supabase SMTP settings).
- Test account `staff.test@example.com` exists (deactivated) in the dev project; delete when no longer needed.
- Disable the `pgtap` extension on the production project (Phase 10).
- Seed prices for Cold Drink, Chips, Water, Sandwich are placeholders; adjust in Phase 3 screens.
- Not run: "supabase db reset runs clean twice" (needs local Supabase CLI + Docker).
- Customer first-time signup (a brand-new email) through the code flow was not tested; only an existing user's code login was.
- Minor: after a full page reload the top bar briefly shows the signed-out buttons until the session is restored.
