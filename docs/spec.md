# E Gaming Era – Specification

- Part A: Documentation (what the system does)
- Part B: Build plan for Claude Code (build order, one phase per session)

---

# Part A – Documentation

## 1. Overview

One web application handles slot booking and bills gaming time and canteen sales for E Gaming Era on one receipt. It runs in any browser and installs as an app (PWA) on Android, iPhone and Windows.

| Item | Detail |
| --- | --- |
| Purpose | Slot booking (advance and on location), time-based gaming billing, canteen POS, stock control, dashboard and reports |
| Users | Admin (owner), Staff (counter operators), Customer (online and walk-in players) |
| Frontend | Angular + Tailwind, installable PWA (see Part B) |
| Backend | Supabase: PostgreSQL database, Auth, Realtime sync |
| Devices | Multiple counters, tablets and phones, live-synced |
| Payment modes | Cash, UPI (QR with amount), Card, split payments |
| Printing | 58 mm or 80 mm thermal receipt printer |

**Out of scope (v1):** GST tax invoice with CGST/SGST split, automatic UPI payment confirmation, customer loyalty/wallet, offline billing.

### Roles and permissions

Three roles: Admin manages everything, Staff runs the counter, Customer books and views own slots.

| Function | Admin | Staff | Customer |
| --- | --- | --- | --- |
| Dashboard (sales, occupancy, bookings, stock) | Yes | No | No |
| All settings: shop, rates, packages, stations, booking rules | Yes | No | No |
| Staff accounts and roles | Yes | No | No |
| Products: add, edit, price | Yes | No | No |
| Canteen stock: purchase, wastage, adjustment | Yes | Yes | No |
| Assign slot / start session for walk-in customer | Yes | Yes | No |
| Check in advance bookings, mark no-show | Yes | Yes | No |
| Canteen sale, billing, print receipt | Yes | Yes | No |
| Void bill, cancel session, refund | Yes | No | No |
| Reports and CSV export | Yes | Today only | No |
| Register / login | – | – | Yes |
| View live slot availability | Yes | Yes | Yes |
| Book slot in advance (online) | Yes (on behalf) | Yes (on behalf) | Yes |
| Cancel or reschedule own booking (before cutoff) | Yes | Yes | Yes |
| View own bookings and bill history | – | – | Yes |

**Booking channels**

| Channel | Who books | How |
| --- | --- | --- |
| Advance (online) | Customer | Customer app / website → pick station type, date, time, duration → confirm |
| On location (walk-in) | Staff for customer | Counter → free station or next free slot → start now or reserve |
| Phone call | Staff for customer | Staff creates booking with customer name and phone |

## 2. Functional requirements

| ID | Module | Requirement | Role |
| --- | --- | --- | --- |
| FR-01 | Stations | Show every active station with status: Available, Running, Paused, Ended | All |
| FR-02 | Stations | Start a session per hour or with a fixed package; capture customer name and phone (optional) | All |
| FR-03 | Stations | Live timer and live gaming charge on each station card | All |
| FR-04 | Stations | Pause, resume, stop; resume after stop if customer continues | All |
| FR-05 | Stations | Show package time left and overtime | All |
| FR-06 | Stations | Cancel a session without a bill | Admin |
| FR-07 | Canteen | Product grid with categories and search | All |
| FR-08 | Canteen | Sell to walk-in customer or add items to a running station tab | All |
| FR-09 | Canteen | Block sale when quantity exceeds stock | All |
| FR-10 | Checkout | One bill combining gaming time and canteen items | All |
| FR-11 | Checkout | Flat discount in rupees, not above subtotal | All |
| FR-12 | Checkout | Split payment across Cash, UPI and Card; total must match exactly | All |
| FR-13 | Checkout | Change-to-return calculator for cash | All |
| FR-14 | Checkout | UPI QR code with payee and exact amount | All |
| FR-15 | Receipts | Print 58 mm or 80 mm thermal receipt; reprint any bill | All |
| FR-16 | Stock | Auto-deduct stock on sale | System |
| FR-17 | Stock | Record purchase, wastage, adjustment with note | All |
| FR-18 | Stock | Low-stock alert per product threshold; movement log | All |
| FR-19 | Bills | List bills by date; void with reason, restoring stock | Void: Admin |
| FR-20 | Reports | Net sales, gaming vs canteen, discounts, payment modes, top 10 items, CSV export | All |
| FR-21 | Settings | Shop details, UPI ID, receipt width, billing block, minimum bill, footer | Admin |
| FR-22 | Settings | Manage stations, rates, packages, products | Admin |
| FR-23 | Users | Three roles: Admin, Staff, Customer; owner promoted to Admin once; staff accounts created by Admin; customers self-register | Admin |
| FR-24 | Sync | All devices update live when data changes | System |

### Dashboard and slot booking

| ID | Module | Requirement | Role |
| --- | --- | --- | --- |
| FR-25 | Dashboard | Today's sales (gaming, canteen, payment modes), live station occupancy, today's bookings, no-shows, low-stock items | Admin |
| FR-26 | Dashboard | Trend: sales and occupancy by day for last 30 days; busiest hours | Admin |
| FR-27 | Customer account | Register and login (see D1); profile: name, phone | Customer |
| FR-28 | Availability | Show free slots by station type, date and time; booked and running stations shown as unavailable | All |
| FR-29 | Advance booking | Book station type, date, start time, duration (see D5) | Customer, Staff, Admin |
| FR-30 | Advance booking | Booking window and slot size set by Admin (e.g. up to 7 days ahead, 30-min slots) | Admin |
| FR-31 | Advance booking | Prevent double booking: one booking or session per station per time window | System |
| FR-32 | Advance booking | Optional advance payment via UPI; amount adjusted in final bill (not in v1, see D3) | Customer |
| FR-33 | Booking changes | Cancel or reschedule up to the cutoff time set by Admin | Customer, Staff, Admin |
| FR-34 | On location | Staff assigns a free station to a walk-in customer and starts the timer, or reserves the next free slot | Staff, Admin |
| FR-35 | Check-in | Staff checks in a booked customer; session starts on the booked station | Staff, Admin |
| FR-36 | No-show | Booking auto-released after grace period (e.g. 15 min) and marked No-show | System |
| FR-37 | Walk-in conflict | Warn staff when a walk-in session would run into an upcoming booking on that station | System |
| FR-38 | Notifications | Booking confirmation and reminder to customer (email in v1, see D10) | System |
| FR-39 | Customer history | Customer sees own bookings, status and past bills | Customer |

**Booking statuses:** Pending payment → Confirmed → Checked in → Completed. Side exits: Cancelled, No-show. (v1 has no advance payment, so bookings start as Confirmed.)

## 3. Billing rules

Gaming time rounds up to the billing block; per-hour sessions charge at least the minimum bill. Paused time is not charged.

| Setting | Default | Effect |
| --- | --- | --- |
| Billing block | 15 min | Played time rounds up to the next block |
| Minimum bill | 30 min | Per-hour sessions are charged at least this time |
| Package overtime | Station hourly rate | Time beyond the package is charged in billing blocks |
| Rate snapshot | At session start | Later rate changes do not affect running sessions |

**Worked examples (default settings)**

| Session | Played | Calculation | Charge (₹) |
| --- | --- | --- | --- |
| PS5 per hour, ₹120/hr | 47 min | Rounds to 60 min × ₹120/hr | 120 |
| PC per hour, ₹60/hr | 10 min | Minimum 30 min × ₹60/hr | 30 |
| PC per hour, ₹60/hr | 1 h 31 min | Rounds to 105 min × ₹60/hr | 105 |
| PC 3 Hours package, ₹150 | 2 h 50 min | Within package | 150 |
| PC 3 Hours package, ₹150 | 3 h 21 min | 21 min over → 30 min × ₹60/hr = ₹30 | 180 |

**Rules at checkout**

- Pressing **Bill** freezes the timer; the amount shown is the amount saved.
- The server recalculates gaming charge and item prices; the device cannot change them.
- Discount must be between ₹0 and the subtotal.
- Cash + UPI + Card must equal the total exactly, or the bill is not saved.

## 4. Setup and deployment

Setup: create the database, add two keys, deploy the web app, register the owner. Exact commands for the v1 build are produced in Phase 10 as docs/DEPLOY.md.

**Step 1 – Database (Supabase)**

- [ ] Create a project at supabase.com (region: Mumbai, ap-south-1).
- [ ] Apply migrations (`supabase link`, `supabase db push`).
- [ ] Authentication → Providers → Email: enabled.

**Step 2 – Connect the app**

- [ ] Project Settings → API: copy Project URL and the anon public key.
- [ ] Put both into the production environment file of `web/`. Never use the service_role key in `web/`.

**Step 3 – Host the app (HTTPS required)**

| Option | Steps |
| --- | --- |
| Netlify | Build `web/`, publish the build folder, SPA redirect rule |
| Vercel / Cloudflare Pages | Same as Netlify |
| Own server (IIS / Nginx) | Copy build folder to web root, SPA rewrite, enable HTTPS |

**Step 4 – First login**

- [ ] Register the owner account, then run `select promote_admin('owner@email')` once in SQL Editor.
- [ ] Settings: shop name, address, phone, UPI ID, receipt width.
- [ ] Settings: stations, hourly rates, packages, booking settings, opening hours.
- [ ] Stock: products, prices, opening stock.
- [ ] Admin → Staff: create staff accounts.

**Step 5 – Install on devices**

| Device | Steps |
| --- | --- |
| Android (Chrome) | Menu → Install app / Add to Home screen |
| iPhone (Safari) | Share → Add to Home Screen |
| Windows (Chrome / Edge) | Install icon in the address bar |

## 5. User manuals

Staff run the counter from five screens: Stations, Bookings, Canteen, Bills, Stock. Customers book from the booking site or at the counter.

### Staff

**Give a slot to a walk-in customer (on location)**

1. Stations → find a free station; check the upcoming-booking note on the card.
2. Tap **Start** → per hour or package → customer name and phone.
3. No free station: Bookings → **New booking** → next free slot → confirm; tell the customer the time.

**Check in an advance booking**

1. Bookings → Today → find customer by name or phone.
2. Tap **Check in**. The session starts on the booked station.
3. Customer not arrived after the grace period: booking is released as No-show.

**Start a gaming session**

1. Stations → tap **Start** on a free station.
2. Billing: choose Per hour or a package.
3. Enter customer name and phone (optional) → **Start timer**.

**Add snacks to a player's bill**

1. Tap **+ Items** on the station card (or Canteen → Bill to: station tab).
2. Tap items; use + / − to change quantity.
3. Tap **Add to tab**. Items appear on the station card.

**Walk-in canteen sale**

1. Canteen → Bill to: Walk-in.
2. Tap items → **Checkout**.

**Bill and collect payment**

1. Tap **Bill** on the station card. The timer stops.
2. Check lines and subtotal; enter discount if approved.
3. Tap Cash, UPI or Card to pay all by one mode, or type split amounts.
4. UPI: customer scans the QR; confirm credit in the UPI app before saving.
5. Cash: enter Cash received to see change to return.
6. **Confirm payment** (enabled only when amounts match) → **Print receipt**.

**Other tasks**

| Task | Steps |
| --- | --- |
| Customer takes a break | **Pause**, then **Resume** |
| Customer continues after Stop | **Resume** on the ended station card |
| Remove item from a tab | Canteen → select station tab → remove |
| Reprint a receipt | Bills → pick date → **Print** |
| Stock received | Stock → **Stock in/adjust** → Purchase → quantity, vendor note |
| Damaged item | Stock → **Stock in/adjust** → Wastage → quantity, reason |

**Day closing checklist**

- [ ] No station left Running or Ended without a bill.
- [ ] Reports → today: note Cash, UPI, Card totals.
- [ ] Count cash drawer; match to Cash total.
- [ ] Match UPI app credits to UPI total.
- [ ] Check low-stock alert; inform Admin.

### Customer

**Book a slot in advance**

1. Open the E Gaming Era booking site or installed app → **Login** (email code, D1).
2. Choose station type (PC, PS5, ...), date, start time and duration.
3. Free slots are shown; booked slots are greyed out.
4. Confirm → booking is **Confirmed**.
5. Arrive on time; give your name or phone at the counter.

**Manage a booking**

| Task | Steps |
| --- | --- |
| Cancel | My bookings → booking → **Cancel** (before cutoff) |
| Reschedule | My bookings → booking → **Change time** → pick a free slot |
| View bills | My bookings → Past → bill |

**Book on location:** walk in and ask the counter; staff assign the next free station.

## 6. Admin guide

Only the Admin can change rates, products, staff access and void bills.

**Dashboard (Admin home screen)**

| Widget | Shows |
| --- | --- |
| Today's sales | Total, gaming, canteen, discounts; Cash / UPI / Card |
| Live occupancy | Stations in use vs total, by type |
| Today's bookings | Upcoming, checked in, no-shows, cancellations |
| Low stock | Items at or below alert level |
| 30-day trend | Daily sales and occupancy; busiest hours |

**Booking settings**

| Setting | Default |
| --- | --- |
| Slot size | 30 min |
| Booking window | Up to 7 days ahead |
| Min / max booking length | 1 slot / 8 slots |
| Opening hours | Per day of week |
| Stations open for online booking | Per-station flag (keep some for walk-ins) |
| Advance payment | Off in v1 |
| Cancellation cutoff | 2 hours before start |
| No-show grace period | 15 min |

**Admin tasks**

| Task | Where | Steps |
| --- | --- | --- |
| Shop details, UPI ID | Settings → Shop & receipt | Edit fields → **Save** |
| Billing block, minimum bill | Settings → Shop & receipt | Set minutes → **Save** |
| Add or edit station | Settings → Stations | Name, type, rate/hr, order, active, online bookable |
| Add or edit package | Settings → Packages | Name, minutes, price, station type |
| Add product | Products → **+ Product** | Name, category, price, opening stock, low-stock level |
| Edit product or price | Products → **Edit** | Change fields; untick Active to hide from Canteen |
| Create staff | Staff → **+ Staff** | Name, email, temporary password |
| Remove staff access | Staff | Untick **Active** |
| Make someone Admin | Staff | Role → admin |
| Void a wrong bill | Bills → **Void** | Enter reason; stock restored, bill kept as VOID |
| Cancel a session without bill | Stations → **Cancel** | Only when the tab is empty |

**Admin controls checklist (weekly)**

- [ ] Review voided bills and reasons.
- [ ] Review discounts total in Reports.
- [ ] Review wastage and adjustments in stock movements.
- [ ] Disable accounts of staff who have left.

## 7. Thermal printer setup

- [ ] Install the printer driver; set paper size to the roll used (80 mm or 58 mm).
- [ ] Settings → Receipt width = same size.
- [ ] Print dialog: Margins **None**, Headers and footers **off**, Scale **100%**.
- [ ] Optional (Windows PC): start Chrome with `--kiosk-printing` to print without the dialog.
- [ ] Android tablet: Bluetooth printer app with Android print service (e.g. RawBT).

**Receipt contents:** shop name, address, phone, GSTIN (if set), bill number, date/time, customer, items, subtotal, discount, total, payment modes with reference, footer text.

## 8. Security and data model

Bills are created only by a server function, so prices, gaming charges, payment totals and stock are checked in one database transaction.

**Security controls**

| Control | Implementation |
| --- | --- |
| Login | Supabase Auth: email + password (admin/staff), email OTP (customer) |
| Access | Row Level Security on every table; inactive users see no data |
| Admin-only writes | Settings, stations, packages, products, staff, void |
| Bill integrity | `checkout_bill()` recalculates charges, checks payment = total, deducts stock, closes session |
| Audit trail | Voided bills kept with reason; every stock change logged with user and time |
| Keys | App uses the anon key only; service_role key only in Edge Functions |

**Tables**

| Table | Holds |
| --- | --- |
| profiles | User accounts, role (admin/staff/customer), active flag |
| settings | Shop details, UPI, receipt and billing settings (one row) |
| stations | Name, type, hourly rate, active, display order, online_bookable |
| packages | Name, minutes, price, station type |
| sessions | Station, customer, rate snapshot, package, start/pause/end times, status |
| tab_items | Canteen items on a running session |
| products | Name, category, price, stock, low-stock level |
| stock_moves | Every stock change: purchase, sale, wastage, adjust, void |
| bills | Bill number, gaming, canteen, discount, total, status |
| bill_items | Lines on each bill |
| payments | Mode (cash/upi/card), amount, reference per bill |
| customers | Customer profile: name, phone, email, linked login |
| bookings | Customer, station type, station, start, end, slots, status, channel, created by |
| booking_settings | Slot size, window, min/max slots, cutoff, grace period |
| opening_hours | Open and close time per day of week |

**Access rules for Customer role**

- Customer reads and changes only own `customers` and `bookings` rows.
- Customer sees availability (free / busy) only, never other customers' names or bills.
- Bookings are created through a server function that blocks overlapping time on the same station.

**Server functions**

| Function | Purpose | Who |
| --- | --- | --- |
| `checkout_bill(p)` | Create bill, items, payments; deduct stock; close session | Active staff |
| `void_bill(id, reason)` | Mark bill void, restore stock | Admin |
| `stock_move(product, qty, reason, note)` | Purchase, wastage, adjustment | Active staff |
| `session_charge(session, end)` | Gaming charge formula | Internal |
| Session RPCs | start / pause / resume / end / reopen / cancel session, add / remove tab item | Active staff |
| Booking RPCs | get_availability, create / cancel / reschedule / check_in booking, mark_no_show | See Part B Phase 7 |

## 9. Known limits and troubleshooting

**Known limits**

| Limit | Workaround |
| --- | --- |
| Not a GST tax invoice | Add GST fields before GST registration |
| UPI QR does not confirm payment automatically | Staff verify credit in the UPI app before saving |
| Needs internet | Keep a mobile hotspot as backup |

**Troubleshooting**

| Problem | Cause | Fix |
| --- | --- | --- |
| "Account disabled" at login | Staff account not active | Admin → Staff → tick Active |
| "Could not connect" | Wrong URL/key in environment, or no internet | Recheck keys from Supabase → Project Settings → API |
| Confirm payment button disabled | Payments do not equal total | Adjust Cash/UPI/Card until status shows "Payment matches total" |
| "Not enough stock" | Stock lower than quantity | Stock → Stock in/adjust, then retry |
| "Station already has an open session" | Previous session not billed or cancelled | Bill or cancel the open session first |
| Receipt cut off or has margins | Print dialog settings | Margins None, Scale 100%, correct paper size |
| Other device not updating | Realtime drop | Refresh; app also reloads data every 60 seconds |
| Settings menu missing | User is Staff | Ask Admin to change role |

---

# Part B – Build plan for Claude Code

Build the system in 11 phases, one Claude Code session per phase, verifying each before the next. Part A is the specification; Part B is the build order.

## How to use this plan

1. Put `CLAUDE.md` in the repo root and this file at `docs/spec.md`.
2. Run **one phase per session**. Paste that phase's prompt as-is.
3. Use Plan mode (Shift+Tab) for Phases 1, 6, 7, 8 and 10.
4. Verify every acceptance check yourself before starting the next phase.
5. Commit after each phase: `git commit -m "Phase N: <name>"`.
6. If a check fails, stay in the same session: paste the failing check and the error.

**Rule for Claude Code:** the spec wins. Anything not in the spec → ask, do not invent.

## Decisions fixed for v1

| # | Decision | v1 choice | Later option |
| --- | --- | --- | --- |
| D1 | Customer login | Email OTP (Supabase email code, free) | Mobile OTP via SMS provider |
| D2 | Staff/Admin login | Email + password; Admin creates staff accounts | – |
| D3 | Advance payment | None; customer pays at counter | UPI advance via Razorpay |
| D4 | Refunds | Not applicable in v1 (no advance) | With D3 |
| D5 | What customer books | Station type (PC, PS5); system auto-assigns a free station | Pick a specific station |
| D6 | Walk-in reservation | Per-station flag `online_bookable`; Admin keeps some stations walk-in only | – |
| D7 | Slot size / window | 30 min slots, up to 7 days ahead, min 1 slot, max 8 slots | – |
| D8 | Cancellation cutoff | 2 hours before start | – |
| D9 | No-show | Released 15 min after start if not checked in | – |
| D10 | Notifications | Email confirmation + reminder 1 hour before | WhatsApp |
| D11 | Staff reports | Today only | – |
| D12 | GST | Not in v1; GSTIN printed if entered | CGST/SGST invoice |
| D13 | Currency / time zone | INR, Asia/Kolkata for all display and slot times | – |

## Tech stack and structure

| Layer | Choice |
| --- | --- |
| Frontend | Angular (latest stable), standalone components, signals, TypeScript strict |
| UI | Tailwind CSS; mobile-first; dark theme |
| Backend | Supabase: Postgres, Auth, Realtime, Edge Functions, pg_cron |
| Business logic | Postgres functions (RPC) for money, stock and bookings |
| Migrations | Supabase CLI, `supabase/migrations/*.sql` |
| DB tests | pgTAP, run with `supabase test db` |
| App tests | Unit tests for pricing; Playwright end-to-end |
| PWA | `@angular/pwa` |
| Email | Supabase Edge Function + Resend (or SMTP) |
| QR | `qrcode` npm package |
| Hosting | Netlify or Vercel (static) |

**Routes**

| Path | Role | Screens |
| --- | --- | --- |
| `/login` | Admin, Staff | Email + password |
| `/admin/*` | Admin | Dashboard, Settings, Stations, Packages, Products, Staff, Booking settings, Reports |
| `/counter/*` | Staff, Admin | Stations, Bookings, Canteen, Bills, Stock |
| `/book/*` | Customer, public | Availability, Login (OTP), New booking, My bookings, Past bills |

**Folder structure**

```
egaming-era/
├── CLAUDE.md
├── docs/spec.md
├── supabase/
│   ├── migrations/        0001_core.sql, 0002_billing.sql, 0003_auth.sql, 0004_bookings.sql ...
│   ├── functions/         admin-create-staff/, send-booking-email/
│   ├── tests/             *.test.sql
│   └── seed.sql
└── web/
    └── src/app/
        ├── core/          supabase.service, auth, guards, models, pricing.ts
        ├── shared/        ui components, pipes (inr, duration)
        ├── admin/         dashboard, settings, staff, reports
        ├── counter/       stations, bookings, canteen, checkout, bills, stock
        └── book/          availability, booking-form, my-bookings
```

## Phase overview

| Phase | Name | Deliverable | Needs |
| --- | --- | --- | --- |
| 0 | Project setup | Angular app + local Supabase running, git | – |
| 1 | Database: core and billing | Tables, RLS, billing/stock RPCs, seed, DB tests | 0 |
| 2 | Auth and roles | Login, role guards, staff management, customer OTP | 1 |
| 3 | Admin settings | Shop, stations, packages, products, booking settings screens | 2 |
| 4 | Counter: stations | Station grid, timers, start/pause/stop, walk-in slot | 3 |
| 5 | Canteen and stock | POS, station tabs, stock in/wastage, low-stock alert | 4 |
| 6 | Checkout and receipts | Combined bill, split payment, UPI QR, thermal print, bills, void | 5 |
| 7 | Bookings (counter) | Booking tables + RPCs, booking grid, check-in, no-show job | 6 |
| 8 | Customer portal | Availability, book, cancel/reschedule, my bookings | 7 |
| 9 | Dashboard and reports | Admin dashboard, 30-day trend, reports, CSV | 8 |
| 10 | Notifications, PWA, deploy | Emails, install as app, production deploy, E2E suite | 9 |

## Phase 0 – Project setup

**Goal:** empty app and local database running.

**Tasks**

- Install: Node LTS, Angular CLI, Supabase CLI, Docker Desktop, Git.
- Create `web/` (Angular, routing, strict, Tailwind) and `supabase/` (`supabase init`).
- Environment files with Supabase URL and anon key; `.gitignore` for secrets.
- Shell layout: top bar, role-based nav placeholder, 404 page.

**Acceptance checks**

- [ ] `supabase start` runs; Studio opens at localhost:54323.
- [ ] `npm start` shows the shell at localhost:4200, no console errors.
- [ ] Repo has CLAUDE.md, docs/spec.md, first commit.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md. Do Phase 0 only.
Create the folder structure from "Tech stack and structure": an Angular app in web/ (standalone, routing, strict TS, Tailwind, dark mobile-first shell with top bar and placeholder nav) and a Supabase project in supabase/ (supabase init).
Add environment files for SUPABASE_URL and SUPABASE_ANON_KEY using the local values from `supabase status`, and a SupabaseService in core/.
Do not create any tables yet. Finish by listing the commands I run to verify, then commit "Phase 0: setup".
```

## Phase 1 – Database: core and billing

**Goal:** all billing and stock rules enforced in the database, with tests.

**Tasks**

- Migration `0001_core.sql`: profiles (role admin/staff/customer, active), settings, stations (+ `online_bookable`), packages, products, stock_moves.
- Migration `0002_billing.sql`: sessions, tab_items, bills (bill_no identity), bill_items, payments.
- Helper functions: `is_admin()`, `is_staff()` (admin or active staff), `promote_admin(email)` for bootstrap.
- RPCs: `start_session`, `pause_session`, `resume_session`, `end_session`, `reopen_session`, `cancel_session` (admin), `add_tab_item`, `remove_tab_item`, `checkout_bill`, `void_bill` (admin), `stock_move`, `session_charge`.
- RLS: staff read operational tables; admin writes masters; customers no access to these tables; direct inserts to bills/payments/stock blocked.
- One open session per station (partial unique index); stock cannot go below 0 on sale.
- Seed: 3 PCs at ₹60/hr, 2 PS5 at ₹120/hr, packages (PC 3 Hours ₹150, PC Day Pass 600 min ₹400, PS5 2 Hours ₹200), 6 products.

**Acceptance checks**

- [ ] `supabase db reset` runs clean twice.
- [ ] `supabase test db` passes all five worked examples in Part A section 3 (₹120, ₹30, ₹105, ₹150, ₹180).
- [ ] Checkout fails when payments ≠ total, discount > subtotal, or stock insufficient.
- [ ] Void restores stock and keeps the bill with status void.
- [ ] A staff user cannot void; a customer user cannot read bills.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A sections 2, 3, 8; Part B Decisions D1–D13). Do Phase 1 only. Show me the plan first.
Write migrations 0001_core.sql and 0002_billing.sql with every table, index, RLS policy and RPC listed in Phase 1 Tasks.
Billing rules: billing block and minimum bill from settings; package overtime at station hourly rate in blocks; paused time not charged; rate snapshot at session start.
checkout_bill(p jsonb) must: recalc gaming charge and item prices server-side, include tab items, validate discount, require sum(payments) = total, deduct stock with stock_moves rows, close the session — all in one transaction.
Write pgTAP tests in supabase/tests/ for the five worked examples, payment mismatch, stock shortage, void, and role permissions (admin, staff, customer, inactive staff).
Write seed.sql with the starter data. Run supabase db reset and supabase test db until green, then commit "Phase 1: database".
```

## Phase 2 – Auth and roles

**Goal:** each role logs in and sees only its area.

**Tasks**

- Staff/Admin: `/login` with email + password.
- Customer: `/book/login` with email OTP (D1); trigger creates profile with role `customer`.
- Bootstrap: owner signs up, then runs `select promote_admin('owner@email')` once in SQL editor.
- Edge Function `admin-create-staff` (service role, server-side only): Admin creates staff with name, email, temporary password.
- Admin → Staff screen: list, create, activate/deactivate, change role.
- Route guards: `/admin` admin only; `/counter` admin + active staff; `/book/my-*` customer.
- Inactive staff blocked with message "Account disabled – contact Admin".

**Acceptance checks**

- [ ] Admin reaches `/admin` and `/counter`; staff reaches `/counter` only; customer reaches `/book` only.
- [ ] Typing another role's URL redirects to that user's home.
- [ ] Admin creates a staff account; that staff can log in.
- [ ] Deactivated staff cannot log in or call any RPC.
- [ ] Customer receives OTP email (Inbucket locally at localhost:54324) and logs in.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A section 1 "Roles and permissions"; D1, D2). Do Phase 2 only.
Build: AuthService with session signal and current profile; guards adminGuard, staffGuard, customerGuard; /login (email+password) for admin/staff; /book/login (email OTP) for customers.
Add migration 0003_auth.sql: trigger on auth.users creating profiles (role customer by default), promote_admin(email).
Create Edge Function admin-create-staff that verifies the caller is admin, then creates the user with the service role key and sets role staff.
Build Admin → Staff screen (list, create, activate/deactivate, role).
Add tests for guards. Verify every acceptance check in Phase 2, then commit "Phase 2: auth and roles".
```

## Phase 3 – Admin settings

**Goal:** Admin configures the whole shop without touching SQL.

**Tasks**

- Settings: shop name, address, phone, GSTIN, UPI ID, UPI payee name, receipt width (58/80), receipt footer, billing block, minimum bill.
- Stations: add/edit name, type, rate/hr, display order, active, online bookable.
- Packages: name, minutes, price, station type, active.
- Products: name, category, price, low-stock level, track stock, active; opening stock via `stock_move`.
- Booking settings (used in Phase 7): slot size, window days, min/max slots, cutoff hours, grace minutes, opening hours per weekday.

**Acceptance checks**

- [ ] Every field saves and reloads correctly.
- [ ] Staff cannot open `/admin/settings`; direct API update by staff is rejected by RLS.
- [ ] Rate change does not change the rate of a session already running.
- [ ] Forms validate: no negative prices, minutes > 0, required names.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A section 6 "Admin guide" incl. Booking settings; D5–D9). Do Phase 3 only.
Add a migration for booking_settings (single row) and opening_hours (weekday, open_time, close_time, closed).
Build /admin screens: Settings, Stations, Packages, Products, Booking settings, with reactive forms, validation and toasts.
Use direct table writes only where RLS allows admin writes (masters); opening stock goes through the stock_move RPC.
Verify every acceptance check in Phase 3, then commit "Phase 3: admin settings".
```

## Phase 4 – Counter: stations and walk-in slots

**Goal:** staff give a station to a walk-in customer and track time live.

**Tasks**

- `/counter/stations`: card per active station — Available, Running, Paused, Ended.
- Start dialog: per hour or package, customer name, phone.
- Live timer (1 s) and live charge using `pricing.ts`; package time left / overtime.
- Buttons: Pause, Resume, Stop, Resume after stop, + Items, Bill, Cancel (admin).
- Realtime: all counters update within 2 s.
- `pricing.ts` unit tests with the same five examples as Phase 1.

**Acceptance checks**

- [ ] Two browsers: start on one, the other updates without refresh.
- [ ] Paused time is not charged.
- [ ] Second session on the same station is refused.
- [ ] Live charge on the card equals `session_charge` for the same end time.
- [ ] Works at 360 px width.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A FR-01–FR-06, FR-34; section 3 Billing rules; section 5 Staff manual). Do Phase 4 only.
Build /counter/stations with station cards, start dialog and session actions, all calling the Phase 1 RPCs.
Create core/pricing.ts mirroring session_charge exactly, with unit tests for the five worked examples.
Subscribe to Supabase Realtime on sessions and tab_items; refresh state on change.
Leave the Bill button wired to a placeholder (Phase 6). Verify every acceptance check in Phase 4, then commit "Phase 4: stations".
```

## Phase 5 – Canteen and stock

**Goal:** sell snacks to walk-ins or a station tab; stock always correct.

**Tasks**

- `/counter/canteen`: category chips, search, product grid showing stock; out-of-stock disabled.
- Cart with +/−; "Bill to": Walk-in or a running station's tab.
- Add to tab via `add_tab_item`; remove via `remove_tab_item`.
- `/counter/stock`: list with low-stock highlight, Stock in / Wastage / Adjustment dialog (`stock_move`), last 50 movements.
- Staff can update stock; only Admin edits product master.

**Acceptance checks**

- [ ] Cannot add more than available stock.
- [ ] Tab items show on the station card with canteen total.
- [ ] Purchase +24 raises stock by 24 and logs a movement with user and note.
- [ ] Low-stock banner appears at or below the product's alert level.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A FR-07–FR-09, FR-16–FR-18; Roles and permissions). Do Phase 5 only.
Build /counter/canteen (POS + cart + Bill-to selector) and /counter/stock (list, stock dialog, movement log).
Walk-in Checkout opens a placeholder until Phase 6. All stock changes via RPC only.
Verify every acceptance check in Phase 5, then commit "Phase 5: canteen and stock".
```

## Phase 6 – Checkout, payments and receipts

**Goal:** one bill for gaming + canteen, paid by any mix of Cash / UPI / Card, printed on a thermal printer.

**Tasks**

- Bill from a station: freeze timer (`end_session`), show lines, subtotal, discount, total.
- Payment: Cash / UPI / Card fields, "pay all by" buttons, cash received → change, reference field.
- UPI QR: `upi://pay?pa=<upi_id>&pn=<name>&am=<amount>&cu=INR` for the UPI part.
- Confirm enabled only when payments = total; calls `checkout_bill`.
- Receipt: 58/80 mm print layout (shop header, bill no, items, totals, payment modes, footer), print and reprint.
- `/counter/bills`: bills by date, reprint, Void (admin, with reason).

**Acceptance checks**

- [ ] Worked example: PC 3 Hours played 3 h 21 min + 2 Maggi (₹50) + 1 Coffee (₹40), discount ₹5 → total ₹315.
- [ ] Split ₹115 cash + ₹200 UPI saves; ₹100 + ₹200 is refused.
- [ ] UPI QR scans in a UPI app showing the right payee and amount.
- [ ] Receipt prints on 80 mm with no margins; 58 mm layout fits.
- [ ] Voided bill shows VOID, stock restored.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A FR-10–FR-15, FR-19; section 3 Rules at checkout; section 7 Thermal printer). Do Phase 6 only. Show me the plan first.
Build the Checkout dialog (from station Bill and from canteen walk-in), payment split with UPI QR (qrcode package), cash change, and confirm via checkout_bill.
Build a print-only receipt component with @media print CSS for 58 mm and 80 mm (@page margin 0).
Build /counter/bills with date filter, reprint, and admin Void with reason (void_bill).
Add a Playwright test for the worked example (₹315). Verify every acceptance check in Phase 6, then commit "Phase 6: checkout".
```

## Phase 7 – Bookings (database + counter)

**Goal:** bookings can never overlap, and staff manage them from the counter.

**Tasks**

- Migration `0004_bookings.sql`: customers, bookings (customer, station_type, station_id, start_at, end_at, slots, status, created_by, channel online/counter/phone, notes).
- Overlap protection: `btree_gist` exclusion constraint on (station_id, tstzrange(start_at, end_at)) for status Confirmed / Checked in.
- RPCs: `get_availability(station_type, date)` (free count per slot, no customer data), `create_booking` (auto-assigns a free online-bookable station, D5), `cancel_booking` (customer before cutoff, staff any time), `reschedule_booking`, `check_in_booking` (starts the session on the booked station), `mark_no_show`.
- pg_cron every 5 min: Confirmed bookings past start + grace → No-show (D9).
- Walk-in conflict: starting a walk-in session warns when that station has a booking in the next 60 min.
- `/counter/bookings`: today list + day/time grid per station, search by name/phone, New booking (on behalf), Check in, Cancel, No-show.

**Acceptance checks**

- [ ] Two bookings for the same station and overlapping time: second is refused (DB test).
- [ ] Booking outside opening hours, beyond 7 days, or not on a 30-min boundary is refused.
- [ ] Check-in starts the timer on the booked station.
- [ ] Booking not checked in 15 min after start becomes No-show and the station frees.
- [ ] Walk-in start shows the upcoming-booking warning.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A FR-28–FR-37; section 5 Staff "Check in an advance booking"; section 8 tables; D5–D9). Do Phase 7 only. Show me the plan first.
Write migration 0004_bookings.sql with the tables, exclusion constraint (btree_gist), RLS (customer: own rows only; staff/admin: all), RPCs and the pg_cron no-show job listed in Phase 7 Tasks. All slot times in Asia/Kolkata.
Write pgTAP tests for overlap, window, opening hours, slot boundary, cutoff, check-in and no-show.
Build /counter/bookings (list + grid, new booking on behalf, check in, cancel, no-show) and the walk-in conflict warning on the Start dialog.
Verify every acceptance check in Phase 7, then commit "Phase 7: bookings".
```

## Phase 8 – Customer portal

**Goal:** a customer books, changes and tracks slots from a phone.

**Tasks**

- `/book`: public availability by station type and date (no login needed to look).
- Book: login with email OTP → profile (name, phone) once → pick type, date, start, duration (1–8 slots) → confirm.
- `/book/my-bookings`: upcoming and past, status badges, Cancel and Change time (before cutoff), past bills.
- Clear messages: slot just taken, outside hours, past cutoff.

**Acceptance checks**

- [ ] Customer books a PS5 for tomorrow 6:00–7:00 pm; it appears on `/counter/bookings` within 2 s.
- [ ] Two customers try the last free slot together: one succeeds, one gets "slot just taken".
- [ ] Cancel works 3 hours before start and is refused 1 hour before.
- [ ] Customer cannot see other customers' names, bookings or bills (API test).
- [ ] Full flow works on a 360 px phone screen.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A section 1 Booking channels; FR-27–FR-33, FR-39; section 5 Customer manual; D1, D5, D7, D8). Do Phase 8 only. Show me the plan first.
Build the /book area: public availability, OTP login, first-time profile form, booking form, my bookings (cancel, reschedule, past bills).
Use only get_availability, create_booking, cancel_booking, reschedule_booking RPCs and RLS-protected reads of the customer's own rows.
Add a Playwright test for book → reschedule → cancel and a concurrency test for the last slot.
Verify every acceptance check in Phase 8, then commit "Phase 8: customer portal".
```

## Phase 9 – Admin dashboard and reports

**Goal:** the owner sees the business at a glance.

**Tasks**

- RPCs (admin only): `dashboard_today()`, `sales_trend(days)`, `busy_hours(days)`, `sales_report(from, to)`.
- `/admin/dashboard`: widgets from Part A section 6 — today's sales by mode, live occupancy, today's bookings and no-shows, low stock, 30-day sales and occupancy chart, busiest hours.
- `/admin/reports`: date range, gaming vs canteen, discounts, voids, payment modes, top 10 items, CSV export.
- Staff report: today only (D11).

**Acceptance checks**

- [ ] Dashboard totals equal the sum of today's paid bills (DB test on seed data).
- [ ] Void bills excluded from sales, shown in void count.
- [ ] CSV opens in Excel with correct columns and ₹ amounts.
- [ ] Staff cannot call dashboard RPCs.

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A FR-20, FR-25, FR-26; section 6 Dashboard; D11). Do Phase 9 only.
Write admin-only SQL functions dashboard_today, sales_trend, busy_hours, sales_report with tests.
Build /admin/dashboard (tiles + line chart + busy-hours bar chart) and /admin/reports (range, tables, CSV). Staff get a Today report on /counter.
Verify every acceptance check in Phase 9, then commit "Phase 9: dashboard".
```

## Phase 10 – Notifications, PWA and deployment

**Goal:** live system on the internet, installable, with booking emails.

**Tasks**

- Edge Function `send-booking-email`: confirmation on create/reschedule/cancel; reminder 1 hour before via pg_cron (D10).
- PWA: `@angular/pwa`, app name "E Gaming Era", icons, offline shell page.
- Production: new Supabase project (Mumbai region), `supabase link`, `supabase db push`, deploy Edge Functions, set secrets (email API key).
- Host `web/` on Netlify/Vercel with production env; SPA redirect rule; custom domain + HTTPS.
- Full Playwright suite against staging; security review of RLS (every table, every role).

**Acceptance checks**

- [ ] Booking confirmation and reminder emails arrive.
- [ ] App installs on Android, iPhone and Windows.
- [ ] Production: owner promoted to admin, staff created, test booking + bill + receipt work end to end.
- [ ] All DB tests and Playwright tests pass.
- [ ] No service_role key in the web build (search the deployed JS).

**Prompt**

```text
Read CLAUDE.md and docs/spec.md (Part A section 4 Setup; FR-38; D10). Do Phase 10 only. Show me the plan first.
Build the send-booking-email Edge Function and the reminder cron; add @angular/pwa with icons and manifest.
Write docs/DEPLOY.md with exact steps for production Supabase (link, db push, functions deploy, secrets) and Netlify (build command, publish dir, SPA redirect, env vars).
Run the full test suite and an RLS review listing every table x role (select/insert/update/delete) and fix any gap.
Then commit "Phase 10: release v1".
```

## After v1 (backlog)

- UPI advance payment and refunds via Razorpay (D3, D4).
- Mobile OTP and WhatsApp notifications (D1, D10).
- GST invoice with CGST/SGST split (D12).
- Customer picks a specific station (D5); loyalty points / prepaid wallet.
