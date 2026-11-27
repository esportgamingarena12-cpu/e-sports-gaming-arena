import { Component, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { DIRECT_URL, proxyBase } from '../core/api-route';

export interface TestResult {
  name: string;
  /** what the test looks at, in plain words */
  note: string;
  ok: boolean;
  /** "200", "400", "no answer", "timed out" ... */
  status: string;
  /** milliseconds for each try, in order */
  times: number[];
  /** the browser's own words when a request failed (never a password or a token) */
  detail?: string;
}

/** What to tell the person, from the results. Pure, so it can be tested. */
export function verdict(results: TestResult[]): { good: boolean; text: string } {
  const failed = results.filter((r) => !r.ok);
  if (results.length === 0) return { good: false, text: 'The test has not run yet.' };
  if (failed.length === 0) {
    return { good: true, text: 'This computer reaches the server normally right now. If signing in still fails, note the time it happened and tell the owner.' };
  }
  return {
    good: false,
    text: `${failed.length} of ${results.length} checks failed (${failed.map((f) => f.name).join(', ')}). Something between this computer and the server is dropping or blocking these requests: the internet connection, a router, antivirus or firewall software, a proxy, a browser extension or a VPN. Try another network (a phone hotspot) or another browser and run the test again.`,
  };
}

/** A short text the person can copy and send. Contains no password, no email and no token. */
export function reportText(results: TestResult[], context: { when: string; agent: string; online: boolean; link: string }): string {
  const lines = results.map((r) => `${r.ok ? 'OK    ' : 'FAILED'} ${r.name}: ${r.status}${r.times.length ? ` (${r.times.map((t) => t + ' ms').join(', ')})` : ''}${r.detail ? ` - ${r.detail}` : ''}`);
  return [`Connection test ${context.when}`, `Browser: ${context.agent}`, `Online: ${context.online ? 'yes' : 'no'}${context.link ? `, link: ${context.link}` : ''}`, ...lines, verdict(results).text].join('\n');
}

const FN = `${DIRECT_URL}/functions/v1/secure-login`;
const RPC = `${DIRECT_URL}/rest/v1/rpc/happy_hours_info`;
/** this website's own door to the project (null on a local computer) */
const PROXY = proxyBase(typeof location === 'undefined' ? null : location);
const KEY = environment.SUPABASE_ANON_KEY;
const TIMEOUT_MS = 15_000;

interface Try {
  status: string;
  ms: number;
  ok: boolean;
  detail?: string;
}

async function attempt(url: string, init: RequestInit, accept: (status: number) => boolean, needProxyHeader = false): Promise<Try> {
  const started = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    await res.text().catch(() => '');
    const viaDoor = !needProxyHeader || !!res.headers.get('x-sb-proxy');
    return { status: viaDoor ? String(res.status) : `${res.status}, not through this website's door`, ms: Math.round(performance.now() - started), ok: viaDoor && accept(res.status) };
  } catch (e) {
    const timedOut = ctl.signal.aborted;
    return { status: timedOut ? 'timed out' : 'no answer', ms: Math.round(performance.now() - started), ok: false, detail: timedOut ? `no answer within ${TIMEOUT_MS / 1000} seconds` : `${(e as Error).name}: ${(e as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const post = (body: object): RequestInit => ({ method: 'POST', headers, body: JSON.stringify(body) });

/** Runs one check several times and folds the tries into one result. */
async function check(name: string, note: string, times: number, run: () => Promise<Try>): Promise<TestResult> {
  const tries: Try[] = [];
  for (let i = 0; i < times; i++) tries.push(await run());
  const bad = tries.filter((t) => !t.ok);
  return {
    name,
    note,
    ok: bad.length === 0,
    status: bad.length === 0 ? tries[0].status : `${bad.length} of ${tries.length} failed`,
    times: tries.map((t) => t.ms),
    detail: bad[0]?.detail,
  };
}

/** Pads a harmless request to roughly `kb` kilobytes (the real sign-in carries about 1.5 KB of security token). The service refuses it at once as invalid. */
const bigBody = (kb: number) => ({ email: 'connection-test', password: 'x', captcha_token: 'A'.repeat(kb * 1024), verify_only: false });

export async function runConnectionTests(): Promise<TestResult[]> {
  const out: TestResult[] = [];
  out.push(await check('Website files', 'This website loads its own files', 1, () => attempt('/manifest.webmanifest?connection-test', { cache: 'no-store' }, (s) => s === 200)));
  if (PROXY) {
    out.push(await check('Data service via this website', 'The shop data service answers through this website (this works even where supabase.co is blocked)', 1, () => attempt(`${PROXY}/rest/v1/rpc/happy_hours_info`, post({}), (s) => s === 200, true)));
    out.push(await check('Login service via this website (5 tries)', 'The sign-in service answers through this website, five times in a row', 5, () => attempt(`${PROXY}/functions/v1/secure-login`, post({}), (s) => s === 400, true)));
    out.push(await check('Login service via this website, 3 KB request', 'A big request through this website', 2, () => attempt(`${PROXY}/functions/v1/secure-login`, post(bigBody(3)), (s) => s === 400, true)));
  }
  out.push(await check('Data service (direct)', 'The shop data service answers at its own address (some internet providers block it)', 1, () => attempt(RPC, post({}), (s) => s === 200)));
  out.push(await check('Login service (5 tries)', 'The sign-in service answers a small request at its own address, five times in a row', 5, () => attempt(FN, post({}), (s) => s === 400)));
  out.push(await check('Login service, 1.5 KB request', 'A request as big as a real sign-in', 3, () => attempt(FN, post(bigBody(1.5)), (s) => s === 400)));
  out.push(await check('Login service, 3 KB request', 'An even bigger request', 3, () => attempt(FN, post(bigBody(3)), (s) => s === 400)));
  if (environment.TURNSTILE_SITE_KEY) {
    out.push(
      await check('Security check script', 'The security check (Cloudflare) can be reached', 1, async () => {
        const started = performance.now();
        try {
          await fetch('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', { mode: 'no-cors', cache: 'no-store' });
          return { status: 'reached', ms: Math.round(performance.now() - started), ok: true };
        } catch (e) {
          return { status: 'no answer', ms: Math.round(performance.now() - started), ok: false, detail: `${(e as Error).name}: ${(e as Error).message}` };
        }
      }),
    );
  }
  return out;
}

/** A page anyone can open on a computer that has trouble signing in: it tries the same requests and shows which ones fail. It sends no password and changes nothing. */
@Component({
  selector: 'app-connection-test',
  template: `
    <section class="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 class="font-display text-3xl font-bold">Connection test</h1>
      <p class="mt-1 text-sm text-slate-400">
        Checks whether this computer can reach the shop's server the way signing in does. It sends no password, counts no sign-in attempt and changes nothing.
      </p>

      <button type="button" class="btn-primary mt-4" (click)="run()" [disabled]="running()" data-run-test>{{ running() ? 'Testing…' : results().length ? 'Test again' : 'Start the test' }}</button>

      @if (results().length > 0) {
        <ul class="mt-5 space-y-2" data-results>
          @for (r of results(); track r.name) {
            <li class="rounded-2xl border px-4 py-3" [class]="r.ok ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-red-400/50 bg-red-500/10'" [attr.data-result]="r.name" [attr.data-ok]="r.ok">
              <p class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-semibold">{{ r.name }}</span>
                <span class="text-sm font-semibold" [class]="r.ok ? 'text-emerald-300' : 'text-red-300'">{{ r.ok ? 'OK' : 'Failed' }} · {{ r.status }}</span>
              </p>
              <p class="text-xs text-slate-400">{{ r.note }}@if (r.times.length) { · {{ timesText(r) }} }</p>
              @if (r.detail) { <p class="mt-1 text-xs text-red-200">{{ r.detail }}</p> }
            </li>
          }
        </ul>
        @if (!running()) {
          <p class="mt-4 rounded-xl border p-3 text-sm" [class]="verdict().good ? 'border-emerald-400/40 text-emerald-100' : 'border-amber-400/50 text-amber-100'" data-verdict>{{ verdict().text }}</p>
          <button type="button" class="btn mt-3" (click)="copy()" data-copy>{{ copied() ? 'Copied' : 'Copy the result' }}</button>
          <textarea class="field mt-3 h-40 w-full font-mono text-xs" readonly [value]="report()" aria-label="The result, to copy and send"></textarea>
        }
      }
    </section>
  `,
})
export class ConnectionTest {
  protected readonly results = signal<TestResult[]>([]);
  protected readonly running = signal(false);
  protected readonly copied = signal(false);
  protected readonly verdict = computed(() => verdict(this.results()));
  protected readonly report = computed(() => {
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    return reportText(this.results(), {
      when: new Date().toString(),
      agent: navigator.userAgent,
      online: navigator.onLine,
      link: conn ? `${conn.effectiveType ?? '?'}, ${conn.downlink ?? '?'} Mbps, ${conn.rtt ?? '?'} ms` : '',
    });
  });

  protected timesText(r: TestResult): string {
    return r.times.map((t) => `${t} ms`).join(', ');
  }

  protected async run(): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    this.copied.set(false);
    this.results.set([]);
    try {
      this.results.set(await runConnectionTests());
    } finally {
      this.running.set(false);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.report());
      this.copied.set(true);
    } catch {
      /* the text is in the box below: it can be selected and copied by hand */
    }
  }
}
