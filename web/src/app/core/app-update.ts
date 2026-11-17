import { inject, Injectable } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * True for the errors a browser gives when a page piece (a lazy-loaded screen) cannot be fetched or is not valid JavaScript.
 * That happens after a new version is deployed while an old copy of the app is still open or cached: the old copy asks for a
 * file name that no longer exists. Pure, so it can be tested.
 */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError|Importing a module script failed|Unexpected token '<'/i.test(text);
}

/** Reload at most once per `windowMs`, so a page that keeps failing cannot reload forever. */
export function mayReload(lastReloadAt: number | null, now: number, windowMs = 60_000): boolean {
  return lastReloadAt === null || !(now - lastReloadAt < windowMs);
}

const RELOAD_KEY = 'app-update-reload-at';

/** Reload the page once (when the guard allows it). Returns true when a reload was started. */
export function reloadOnce(): boolean {
  let last: number | null = null;
  try {
    const v = sessionStorage.getItem(RELOAD_KEY);
    last = v ? Number(v) : null;
  } catch {
    /* storage unavailable: still allow one reload below */
  }
  if (!mayReload(last, Date.now())) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  location.reload();
  return true;
}

/**
 * Keeps a long-open counter screen from going blank after a new version is deployed:
 *  - it checks for a new version when the tab comes back to the front and every 15 minutes;
 *  - when a new version is ready it waits for the next time the person opens another screen, then loads that screen
 *    fresh (so nothing they are typing is thrown away);
 *  - if a screen still cannot be loaded (see isChunkLoadError) the page reloads once.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  /** missing when the service worker is not set up (development, tests) */
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly router = inject(Router);
  private ready = false;

  constructor() {
    const sw = this.sw;
    if (!sw || !sw.isEnabled) return;
    sw.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => (this.ready = true));
    this.router.events.pipe(filter((e): e is NavigationStart => e instanceof NavigationStart)).subscribe((e) => {
      if (!this.ready) return;
      this.ready = false;
      void sw.activateUpdate().finally(() => location.assign(e.url));
    });
    const check = () => void sw.checkForUpdate().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 15 * 60_000);
  }
}
