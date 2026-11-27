// Which internet address a sign-in request really came from, for the lockout rule ("20 wrong passwords from one address lock the address").
//
// Normally it is the address Supabase's edge saw (cf-connecting-ip, else x-forwarded-for).
// A request that came through this shop's own website door (the Cloudflare function in web/functions/sb) reaches Supabase from Cloudflare,
// so every visitor would look like one address. That door therefore adds the real address in x-client-ip together with a shared secret
// (x-proxy-secret = the PROXY_SECRET function secret). x-client-ip is believed ONLY when the secret matches; without the right secret it is ignored,
// so nobody can pretend to be another address (or lock one out) by sending the header themselves.

type Headers = { get(name: string): string | null };

/** Compare two secrets without stopping at the first different character (so timing reveals nothing). */
export function sameSecret(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function clientIp(headers: Headers, proxySecret: string | undefined | null): string {
  const first = (v: string | null): string | null => {
    const t = (v ?? '').split(',')[0].trim().slice(0, 64);
    return t === '' ? null : t;
  };
  const secret = proxySecret ?? '';
  const viaDoor = secret !== '' && sameSecret(headers.get('x-proxy-secret') ?? '', secret);
  const fromDoor = viaDoor ? first(headers.get('x-client-ip')) : null;
  return fromDoor ?? first(headers.get('cf-connecting-ip')) ?? first(headers.get('x-forwarded-for')) ?? 'unknown';
}
