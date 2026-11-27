// Cloudflare Pages Function: this website's own door to the shop's Supabase project.
//
// Why: some internet providers in India block *.supabase.co, so a computer on such a connection cannot reach the shop's data at all
// (the website itself and Cloudflare still load). The app sends its requests to /sb/... on THIS website instead, and this function
// passes them on to the project. Nothing is changed in what is sent or answered.
//
// What it will and will not do:
//   - it only forwards to ONE project (TARGET below) and only to the paths the app uses (sign-in, data, shop functions, photos, live updates);
//   - it never adds a key: the app's own public key travels with the request, as it does without the proxy;
//   - it passes the real visitor address to the sign-in function in x-client-ip, together with a shared secret (PROXY_SECRET), so the
//     "5 wrong passwords lock the account, 20 from one address lock the address" rule still counts the right address. A visitor
//     cannot set these two headers themselves: they are removed from the incoming request first.
//   - if anything goes wrong it answers 502 with the header x-sb-proxy, so the app knows to try the direct address instead.
//
// Set in Cloudflare Pages > Settings > Environment variables (production): PROXY_SECRET (the same value as the Supabase function secret).

interface Env {
  PROXY_SECRET?: string;
}

const TARGET = 'https://cwioasxspzutwglvnthl.supabase.co';
const ALLOWED_PATH = /^\/(auth\/v1|rest\/v1|functions\/v1|storage\/v1|realtime\/v1)(\/|$)/;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** headers that describe the visitor's connection or are ours alone: they are never passed on as they came */
const DROP_REQUEST_HEADERS = ['host', 'cookie', 'cf-connecting-ip', 'cf-ray', 'cf-ipcountry', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'x-client-ip', 'x-proxy-secret'];

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-sb-proxy': '1', 'cache-control': 'no-store' } });

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/sb/, '') || '/';
    if (!ALLOWED_METHODS.has(request.method)) return json(405, { error: 'Method not allowed' });
    if (!ALLOWED_PATH.test(path)) return json(404, { error: 'Not found' });

    const headers = new Headers(request.headers);
    for (const h of DROP_REQUEST_HEADERS) headers.delete(h);
    const client = request.headers.get('cf-connecting-ip');
    if (client) headers.set('x-client-ip', client);
    if (env.PROXY_SECRET) headers.set('x-proxy-secret', env.PROXY_SECRET);

    const upstream = await fetch(new Request(TARGET + path + url.search, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    }));

    // a live-updates connection (WebSocket) is handed over as it is
    if (upstream.status === 101) return upstream;

    const out = new Response(upstream.body, upstream);
    out.headers.set('x-sb-proxy', '1');
    out.headers.delete('set-cookie');
    return out;
  } catch {
    return json(502, { error: 'The shop server could not be reached through this website.' });
  }
};
