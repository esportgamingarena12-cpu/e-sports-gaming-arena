import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { homeFor, Role } from './models';

/**
 * Not signed in -> that area's login page.
 * Signed in with the wrong role -> that user's own home.
 */
function roleGuard(allowed: Role[], loginUrl: string): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.whenReady();
    const profile = auth.profile();
    if (!profile) return router.parseUrl(loginUrl);
    if (allowed.includes(profile.role)) return true;
    return router.parseUrl(homeFor(profile.role));
  };
}

export const adminGuard = roleGuard(['admin'], '/login');
export const staffGuard = roleGuard(['admin', 'staff'], '/login');
export const customerGuard = roleGuard(['customer'], '/book/login');
