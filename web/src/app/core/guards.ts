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

/**
 * The public home page for someone signed in as admin or staff: they are sent to their own dashboard instead of seeing
 * the customer page mixed with their menus. "?preview=1" (the View public site link) shows the public page on purpose.
 */
export const staffHomeGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  const profile = auth.profile();
  if (profile && (profile.role === 'admin' || profile.role === 'staff') && route.queryParamMap.get('preview') !== '1') {
    return router.parseUrl(homeFor(profile.role));
  }
  return true;
};

export const adminGuard = roleGuard(['admin'], '/login');
export const staffGuard = roleGuard(['admin', 'staff'], '/login');
export const signedInGuard = roleGuard(['admin', 'staff', 'customer'], '/book/login');
export const customerGuard = roleGuard(['customer'], '/book/login');

/** A customer who has not agreed to the current Terms and Privacy Policy is sent to agree first, then back here. */
export const consentGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.needsConsent()) return router.createUrlTree(['/book/profile'], { queryParams: { next: state.url } });
  return true;
};
