import { AfterViewInit, Component, ElementRef, OnDestroy, output, signal, viewChild, WritableSignal } from '@angular/core';
import { environment } from '../../environments/environment';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** True once a Turnstile site key is set: then every password login must carry a token from this widget. */
export const CAPTCHA_REQUIRED = !!environment.TURNSTILE_SITE_KEY;

/** True while the security check has not handed over its token yet (the widget sets it). */
export const checkPending = signal(false);

/**
 * Waits (up to `ms`, 20 seconds by default) for the security check to hand over its token and returns it ('' when it never came).
 * The sign-in buttons are never blocked while it works: a login that is started early simply waits here for the check (the button says
 * "Checking security…") and then goes ahead by itself, so nobody has to wait for a message before pressing Sign in. If the check never
 * comes, a login still sends what there is and the server decides.
 */
export async function waitForToken(read: () => string, ms = 20000): Promise<string> {
  if (!CAPTCHA_REQUIRED) return '';
  const end = Date.now() + ms;
  // stop waiting at once when the check has already failed: no token is coming
  while (!read() && !checkFailed && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  return read();
}

/** True while the security check is in a failed state (set by the widget). */
let checkFailed = false;

/**
 * The token for a login: at once when the check has already passed, otherwise waits for it (see waitForToken) and sets `waiting`
 * while it does, so the button can say "Checking security…".
 */
export async function tokenFor(read: () => string, waiting: WritableSignal<boolean>): Promise<string> {
  if (!CAPTCHA_REQUIRED || read()) return read();
  waiting.set(true);
  try {
    return await waitForToken(read);
  } finally {
    waiting.set(false);
  }
}

/** Loads Cloudflare's script once and resolves when `window.turnstile` is ready. */
let loading: Promise<TurnstileApi> | null = null;
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_URL;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Security check not available')));
      s.onerror = () => {
        loading = null;
        reject(new Error('Security check not available'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * Cloudflare Turnstile: a security check that is normally invisible (it only shows something when it is unsure the visitor is a person).
 * `token` emits the one-time token, or '' when it expires or is reset. A token works for one login only: call reset() after each try.
 * With no site key set it draws nothing and emits '' once, so logins keep working until the check is switched on.
 */
@Component({
  selector: 'app-turnstile',
  template: `
    <div #box class="flex justify-center" data-turnstile></div>
    @if (checking()) {
      <p class="mt-1 flex items-center justify-center gap-2 text-center text-xs text-slate-400" role="status" data-turnstile-checking>
        <span class="size-3 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-300" aria-hidden="true"></span>Checking security…
      </p>
    }
    @if (passed()) {
      <p class="mt-1 text-center text-xs text-emerald-300" role="status" data-turnstile-passed>Security check passed</p>
    }
    @if (problem(); as p) {
      <p class="mt-1 text-center text-xs text-amber-300" role="status" data-turnstile-problem>
        The security check could not run (code {{ p }}). You can still try to sign in.
      </p>
    }
  `,
})
export class Turnstile implements AfterViewInit, OnDestroy {
  readonly token = output<string>();
  /** the error code Cloudflare gave when the check failed (shown to help find the cause) */
  protected readonly problem = signal<string | null>(null);
  /** true while a valid token is held */
  protected readonly passed = signal(false);
  /** true from the moment the box appears until the check has passed or failed: "Checking security…" shows at once */
  protected readonly checking = signal(false);
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private widgetId: string | null = null;
  private destroyed = false;

  ngAfterViewInit(): void {
    if (!CAPTCHA_REQUIRED) {
      this.token.emit('');
      return;
    }
    this.checking.set(true);
    checkPending.set(true);
    void loadTurnstile()
      .then((t) => {
        if (this.destroyed) return;
        this.widgetId = t.render(this.box().nativeElement, {
          sitekey: environment.TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: 'dark',
          callback: (tok: string) => {
            checkFailed = false;
            checkPending.set(false);
            this.checking.set(false);
            this.problem.set(null);
            this.passed.set(true);
            this.token.emit(tok);
          },
          'expired-callback': () => {
            this.passed.set(false);
            this.checking.set(true);
            checkPending.set(true);
            this.token.emit('');
          },
          'error-callback': (code?: string | number) => {
            checkFailed = true;
            checkPending.set(false);
            this.checking.set(false);
            this.passed.set(false);
            this.problem.set(String(code ?? 'unknown'));
            console.warn('Security check problem, code', code); // the code is not sensitive; it helps find the cause
            this.token.emit('');
            return false; // let Cloudflare show its own message too
          },
        });
      })
      .catch(() => {
        checkPending.set(false);
        this.checking.set(false);
        this.token.emit('');
      });
  }

  /** Asks for a fresh token (the old one was used). */
  reset(): void {
    checkFailed = false;
    this.problem.set(null);
    this.passed.set(false);
    this.checking.set(CAPTCHA_REQUIRED);
    checkPending.set(CAPTCHA_REQUIRED);
    this.token.emit('');
    if (this.widgetId && window.turnstile) window.turnstile.reset(this.widgetId);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    checkPending.set(false);
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
  }
}
