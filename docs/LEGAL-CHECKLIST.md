# Before you rely on the legal pages (owner checklist)

The Terms, Privacy Policy, Refund Policy and Contact pages are written in plain language and follow the points India's DPDP Act asks a
notice to cover. They are a starting text, not legal advice.

1. Admin > Settings > "Legal & contact": fill in the registered business name, the Grievance Officer's name, email and phone, the number of
   days refunds are paid in, and the years bills are kept (ask your accountant). Until then the pages say "ask at the counter".
2. Have a lawyer read /terms, /privacy, /refunds and /grievance. Points to confirm: the 7-day reply and 30-day fix promised on /grievance,
   the courts named in the Terms, the liability limit, and how you want to treat customers under 18.
3. Cancel-before time (shown in the Terms and Refund pages) comes from Admin > Booking settings.
4. If you ever add analytics, advertising, a payment page, a map or another outside service: add it to the Privacy Policy, add its host to
   the policy in `web/public/_headers`, and change `LEGAL_VERSION` in `web/src/app/core/legal.ts` so customers agree again.
5. Counter customers who never made an account: if they ask to see or delete their data, handle it through the Grievance Officer. The
   app does not touch counter customers automatically.
6. Keep a note of any data breach and tell affected people and the Data Protection Board of India as the law requires.
