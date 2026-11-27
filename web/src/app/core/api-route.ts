import { environment } from '../../environments/environment';

/**
 * How the app reaches the shop's Supabase project.
 *
 * Some internet providers in India block *.supabase.co, so a computer on such a connection cannot reach the project directly (the
 * website itself still loads). In production the app therefore sends its requests to /sb/... on THIS website, where a small Cloudflare
 * function (web/functions/sb) passes them on. If that route is not working (the function is missing or over its daily limit, or the
 * network drops), the app tries the direct address, and the other way round, and remembers for a few minutes which route worked.
 */
export const PROXY_PREFIX = '/sb';

/** The project's own address (what the proxy forwards to, and the fallback). */
export const DIRECT_URL = environment.SUPABASE_URL.replace(/\/+$/, '');

export interface Where {
  hostname: string;
  origin: string;
}

/** The address of the proxy on this website, or null where there is none (local development, or the proxy is switched off). */
export function proxyBase(loc: Where | undefined | null, enabled: boolean = environment.API_PROXY): string | null {
  if (!enabled || !loc) return null;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return null;
  return `${loc.origin}${PROXY_PREFIX}`;
}

/** The base address the app builds its requests on (the proxy when there is one, else the project's own address). */
export function apiBase(loc: Where | undefined | null = typeof location === 'undefined' ? null : location, enabled: boolean = environment.API_PROXY): string {
  return proxyBase(loc, enabled) ?? DIRECT_URL;
}

/** The name browsers keep the sign-in under. It is fixed to the project's own name, so a login made before the proxy existed is still there. */
export const AUTH_STORAGE_KEY = `sb-${new URL(DIRECT_URL).hostname.split('.')[0]}-auth-token`;

class ProxyUnavailable extends Error {}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RouteOptions {
  proxy: string;
  direct: string;
  real?: FetchLike;
  now?: () => number;
  /** how long to prefer the other route after one failed */
  coolOffMs?: number;
}

/**
 * A fetch that sends the app's requests through the proxy and, when the proxy cannot be used, through the direct address (and back).
 * Only the connection is retried on the other route: an answer from the server (even an error) is returned as it is.
 * "Cannot be used" = no answer at all, or an answer without our x-sb-proxy header (a missing function, or Cloudflare's own limit page).
 */
export function createRoutedFetch(opts: RouteOptions): FetchLike {
  const real: FetchLike = opts.real ?? ((i, n) => fetch(i, n));
  const now = opts.now ?? (() => Date.now());
  const coolOff = opts.coolOffMs ?? 5 * 60_000;
  let preferDirectUntil = 0;
  let preferProxyUntil = 0;

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(opts.proxy)) return real(input, init);
    const rest = url.slice(opts.proxy.length);

    const viaProxy = async (): Promise<Response> => {
      const res = await real(url, init);
      if (!res.headers.get('x-sb-proxy')) throw new ProxyUnavailable();
      return res;
    };
    const viaDirect = (): Promise<Response> => real(opts.direct + rest, init);

    const directFirst = now() < preferDirectUntil && now() >= preferProxyUntil;
    const [first, second] = directFirst ? [viaDirect, viaProxy] : [viaProxy, viaDirect];
    try {
      return await first();
    } catch (e) {
      if (init?.signal?.aborted) throw e; // the caller gave up: no second try
      if (directFirst) preferProxyUntil = now() + coolOff;
      else preferDirectUntil = now() + coolOff;
      return second();
    }
  };
}
