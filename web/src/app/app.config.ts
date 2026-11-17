import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withNavigationErrorHandler } from '@angular/router';

import { isChunkLoadError, reloadOnce } from './core/app-update';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // a screen that cannot be fetched after a new deploy: load the fresh version once instead of showing a blank page
      withNavigationErrorHandler((e) => {
        if (isChunkLoadError(e.error)) reloadOnce();
      }),
    ), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
