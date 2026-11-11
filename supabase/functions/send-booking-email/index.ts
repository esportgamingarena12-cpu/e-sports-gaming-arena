// send-booking-email: sends the queued booking emails (confirmation, change, cancellation, reminder).
// Called every minute by the database job (pg_net) with the shared secret in `x-mail-secret`.
// Secrets (Edge Functions > Secrets): RESEND_API_KEY, MAIL_FUNCTION_SECRET, MAIL_FROM (optional).
// The service role key is used here only, never in web/.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildMail, MailKind } from './email-text.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const MAX_ATTEMPTS = 3;

interface Row {
  id: number;
  kind: MailKind;
  attempts: number;
  bookings: {
    status: string;
    station_type: string;
    start_at: string;
    end_at: string;
    slots: number;
    customers: { name: string; email: string | null } | null;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = Deno.env.get('MAIL_FUNCTION_SECRET');
  if (!secret || req.headers.get('x-mail-secret') !== secret) return json(401, { error: 'Not allowed' });

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json(500, { error: 'RESEND_API_KEY is not set' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const [{ data: shop }, { data: cfg }, { data: rows, error }] = await Promise.all([
    db.from('settings').select('shop_name').maybeSingle(),
    db.from('booking_settings').select('slot_minutes').maybeSingle(),
    db
      .from('booking_emails')
      .select('id, kind, attempts, bookings(status, station_type, start_at, end_at, slots, customers(name, email))')
      .eq('status', 'pending')
      .lt('attempts', MAX_ATTEMPTS)
      .order('id')
      .limit(25),
  ]);
  if (error) return json(500, { error: error.message });

  const from = Deno.env.get('MAIL_FROM') ?? 'E-Sports Gaming Arena <onboarding@resend.dev>';
  const shopName = (shop?.shop_name as string | null) || 'E-Sports Gaming Arena';
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of (rows ?? []) as unknown as Row[]) {
    const b = r.bookings;
    const email = b?.customers?.email?.trim();
    // nothing to send: no address, or a reminder for a booking that is no longer confirmed
    if (!b || !email || (r.kind === 'reminder' && b.status !== 'confirmed')) {
      await db.from('booking_emails').update({ status: 'skipped' }).eq('id', r.id);
      skipped++;
      continue;
    }
    const mail = buildMail(r.kind, {
      shopName,
      customerName: b.customers?.name || 'there',
      stationType: b.station_type,
      startAt: b.start_at,
      endAt: b.end_at,
      slots: b.slots,
      slotMinutes: (cfg?.slot_minutes as number | undefined) ?? 30,
    });
    let errText: string | null = null;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject: mail.subject, html: mail.html, text: mail.text }),
      });
      if (!res.ok) errText = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (e) {
      errText = String((e as Error).message ?? e).slice(0, 300);
    }
    if (!errText) {
      await db.from('booking_emails').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', r.id);
      sent++;
    } else {
      const attempts = r.attempts + 1;
      await db
        .from('booking_emails')
        .update({ attempts, error: errText, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' })
        .eq('id', r.id);
      failed++;
    }
  }
  return json(200, { sent, failed, skipped });
});
