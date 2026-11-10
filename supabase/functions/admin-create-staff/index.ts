// admin-create-staff: an active Admin creates a staff login.
// Uses the service role key INSIDE this function only; it never reaches web/.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. who is calling?
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json(401, { error: 'Not signed in' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!me || me.role !== 'admin' || !me.active) return json(403, { error: 'Admin only' });

  // 2. validate input
  let body: { full_name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' });
  }
  const fullName = (body.full_name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!fullName) return json(400, { error: 'Name is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email' });
  if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters' });

  // 3. create the login, then make it staff
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Could not create user';
    const exists = /already|registered|exists/i.test(msg);
    return json(exists ? 409 : 400, { error: exists ? 'That email already has an account' : msg });
  }

  const { error: profErr } = await admin
    .from('profiles')
    .update({ role: 'staff', full_name: fullName, active: true })
    .eq('id', created.user.id);
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id); // do not leave a half-made account
    return json(500, { error: 'Could not set up the staff profile' });
  }

  return json(200, { id: created.user.id, email, full_name: fullName, role: 'staff' });
});
