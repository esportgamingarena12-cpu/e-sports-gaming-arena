import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withNavigationErrorHandler } from '@angular/router';

import { isChunkLoadError, pageLoadFailed, recoverFromStaleApp } from './core/app-update';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // a screen that cannot be fetched after a new deploy: clear the saved old copy and load the fresh version once, instead of a blank page
      withNavigationErrorHandler((e) => {
        if (isChunkLoadError(e.error) && !recoverFromStaleApp()) pageLoadFailed.set(true); // the recovery was already tried: tell the person
      }),
    ), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
