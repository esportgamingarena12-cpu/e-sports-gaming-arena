import { AfterViewInit, Component, ElementRef, OnDestroy, output, viewChild } from '@angular/core';
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

/** Loads Cloudflare's script once and resolves when `window.turnstile` is ready. */
let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
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
  template: `<div #box class="flex justify-center" data-turnstile></div>`,
})
export class Turnstile implements AfterViewInit, OnDestroy {
  readonly token = output<string>();
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private widgetId: string | null = null;
  private destroyed = false;

  ngAfterViewInit(): void {
    if (!CAPTCHA_REQUIRED) {
      this.token.emit('');
      return;
    }
    void loadTurnstile()
      .then((t) => {
        if (this.destroyed) return;
        this.widgetId = t.render(this.box().nativeElement, {
          sitekey: environment.TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: 'dark',
          callback: (tok: string) => this.token.emit(tok),
          'expired-callback': () => this.token.emit(''),
          'error-callback': () => this.token.emit(''),
        });
      })
      .catch(() => this.token.emit(''));
  }

  /** Asks for a fresh token (the old one was used). */
  reset(): void {
    this.token.emit('');
    if (this.widgetId && window.turnstile) window.turnstile.reset(this.widgetId);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
  }
}
