import { describe, expect, it } from 'vitest';
import { apiBase, createRoutedFetch, DIRECT_URL, proxyBase } from './api-route';

const PROXY = 'https://shop.example.dev/sb';
const DIRECT = 'https://abc.supabase.co';
const ok = (viaDoor: boolean, body = 'ok', status = 200): Response => new Response(body, { status, headers: viaDoor ? { 'x-sb-proxy': '1' } : {} });

describe('proxyBase / apiBase', () => {
  const live = { hostname: 'shop.example.dev', origin: 'https://shop.example.dev' };
  it("uses this website's door in production, and nothing on a local computer or when switched off", () => {
    expect(proxyBase(live, true)).toBe('https://shop.example.dev/sb');
    expect(proxyBase({ hostname: 'localhost', origin: 'http://localhost:4200' }, true)).toBeNull();
    expect(proxyBase({ hostname: '127.0.0.1', origin: 'http://127.0.0.1:4200' }, true)).toBeNull();
    expect(proxyBase(live, false)).toBeNull();
    expect(proxyBase(null, true)).toBeNull();
  });
  it("falls back to the project's own address when there is no proxy", () => {
    expect(apiBase(live, false)).toBe(DIRECT_URL);
    expect(apiBase(live, true)).toBe('https://shop.example.dev/sb');
  });
});

describe('createRoutedFetch', () => {
  function setup(answer: (url: string) => Promise<Response>, now = { t: 0 }) {
    const calls: string[] = [];
    const real = (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      return answer(url);
    };
    return { calls, fetch: createRoutedFetch({ proxy: PROXY, direct: DIRECT, real, now: () => now.t, coolOffMs: 1000 }), now };
  }

  it('sends the request through the proxy and returns its answer, even an error answer, without trying again', async () => {
    const s = setup(async () => ok(true, 'bad', 401));
    const res = await s.fetch(`${PROXY}/auth/v1/token`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(s.calls).toEqual([`${PROXY}/auth/v1/token`]);
  });

  it('tries the direct address when the proxy gives no answer, and prefers it for a while', async () => {
    const s = setup(async (url) => {
      if (url.startsWith(PROXY)) throw new TypeError('Failed to fetch');
      return ok(false);
    });
    expect((await s.fetch(`${PROXY}/rest/v1/a`)).status).toBe(200);
    expect(s.calls).toEqual([`${PROXY}/rest/v1/a`, `${DIRECT}/rest/v1/a`]);
    s.calls.length = 0;
    await s.fetch(`${PROXY}/rest/v1/b`); // direct first now
    expect(s.calls).toEqual([`${DIRECT}/rest/v1/b`]);
  });

  it("treats an answer without our header (a missing function, Cloudflare's own page) as no proxy", async () => {
    const s = setup(async (url) => (url.startsWith(PROXY) ? ok(false, '<html>spa</html>') : ok(false, '{"direct":true}')));
    const res = await s.fetch(`${PROXY}/rest/v1/a`);
    expect(await res.text()).toBe('{"direct":true}');
    expect(s.calls).toEqual([`${PROXY}/rest/v1/a`, `${DIRECT}/rest/v1/a`]);
  });

  it('after the cool-off it tries the proxy first again; when both fail the error is passed on', async () => {
    const now = { t: 0 };
    let proxyDown = true;
    const s = setup(async (url) => {
      if (url.startsWith(PROXY) && proxyDown) throw new TypeError('x');
      if (url.startsWith(DIRECT)) throw new TypeError('blocked');
      return ok(true);
    }, now);
    await expect(s.fetch(`${PROXY}/a`)).rejects.toThrow('blocked');
    now.t = 5000; // cool-off over
    proxyDown = false;
    s.calls.length = 0;
    expect((await s.fetch(`${PROXY}/b`)).status).toBe(200);
    expect(s.calls).toEqual([`${PROXY}/b`]);
  });

  it('does not try again when the caller gave up', async () => {
    const ctl = new AbortController();
    const s = setup(async () => {
      ctl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(s.fetch(`${PROXY}/a`, { signal: ctl.signal })).rejects.toThrow();
    expect(s.calls).toHaveLength(1);
  });

  it('leaves requests to other addresses alone', async () => {
    const s = setup(async () => ok(false));
    await s.fetch('https://elsewhere.test/x');
    expect(s.calls).toEqual(['https://elsewhere.test/x']);
  });
});
