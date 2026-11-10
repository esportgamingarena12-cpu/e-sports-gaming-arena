# E Gaming Era – Billing & Booking

## Spec
- Full specification: docs/spec.md (Part A: Documentation, Part B: Build plan).
- The spec wins. If something is not in the spec, ask before building it.
- Decisions D1–D13 in Part B are final for v1.

## Stack
- web/: Angular (latest stable), standalone components, signals, strict TypeScript, Tailwind.
- supabase/: Postgres migrations, RPC functions, RLS, Edge Functions, pg_cron.

## Rules
- Money, stock, sessions and bookings change ONLY through Postgres functions (RPC).
  The browser never writes bills, payments, stock or bookings tables directly.
- Every table has RLS enabled. Roles: admin, staff, customer (profiles.role).
- All amounts in INR, numeric(10,2). All times stored as timestamptz; display Asia/Kolkata.
- Gaming charge formula lives in SQL (session_charge) and is mirrored in web/src/app/core/pricing.ts.
  Change both together; unit tests must cover both.
- Never use the Supabase service_role key in web/.
- New migration file per change; never edit an applied migration.
- Mobile-first UI; must work at 360 px width without horizontal scroll.

## Commands
- DB: supabase start | supabase db reset | supabase test db
- Web: cd web && npm start | npm test | npx playwright test

## Done means
- Phase acceptance checks pass, tests pass, no console errors, committed.
