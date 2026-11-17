import { Routes } from '@angular/router';
import { BookHome } from './book/book-home';
import { BookLogin } from './book/book-login';
import { adminGuard, customerGuard, signedInGuard, staffGuard, staffHomeGuard } from './core/guards';
import { Login } from './shared/login';
import { NotFound } from './shared/not-found';

/**
 * The public pages a visitor lands on (home, login, 404) are part of the first download. Everything behind a
 * login (the admin and counter screens, and the customer's own bookings) is loaded only when it is opened, so a
 * customer on a phone does not download the staff screens. The service worker still caches every piece, so the
 * app keeps working offline once installed.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'book' },
  { path: 'login', component: Login },

  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./admin/reports/dashboard').then((m) => m.Dashboard) },
      { path: 'reports', loadComponent: () => import('./admin/reports/reports').then((m) => m.Reports) },
      { path: 'settings', loadComponent: () => import('./admin/settings/shop-settings').then((m) => m.ShopSettings) },
      { path: 'stations', loadComponent: () => import('./admin/stations/stations').then((m) => m.Stations) },
      { path: 'packages', loadComponent: () => import('./admin/packages/packages').then((m) => m.Packages) },
      { path: 'passes', loadComponent: () => import('./admin/passes/pass-types').then((m) => m.PassTypes) },
      { path: 'products', loadComponent: () => import('./admin/products/products').then((m) => m.Products) },
      { path: 'games', loadComponent: () => import('./admin/games/games').then((m) => m.GamesAdmin) },
      { path: 'booking-settings', loadComponent: () => import('./admin/booking/booking-settings').then((m) => m.BookingSettings) },
      { path: 'staff', loadComponent: () => import('./admin/staff/staff').then((m) => m.StaffAdmin) },
    ],
  },
  {
    path: 'counter',
    canActivate: [staffGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'stations' },
      { path: 'stations', loadComponent: () => import('./counter/stations/stations').then((m) => m.CounterStations) },
      { path: 'bookings', loadComponent: () => import('./counter/bookings/bookings').then((m) => m.CounterBookings) },
      { path: 'canteen', loadComponent: () => import('./counter/canteen/canteen').then((m) => m.Canteen) },
      { path: 'bills', loadComponent: () => import('./counter/bills/bills').then((m) => m.Bills) },
      { path: 'unbilled', redirectTo: 'bills' }, // the old Unbilled screen now lives on Bills, as Pending
      { path: 'stock', loadComponent: () => import('./counter/stock/stock').then((m) => m.StockScreen) },
      { path: 'customers', loadComponent: () => import('./counter/customers/customers').then((m) => m.Customers) },
      { path: 'passes', loadComponent: () => import('./counter/passes/passes').then((m) => m.CounterPasses) },
      { path: 'today', loadComponent: () => import('./counter/today/today').then((m) => m.Today) },
    ],
  },
  {
    path: 'book',
    children: [
      { path: '', pathMatch: 'full', component: BookHome, canActivate: [staffHomeGuard], runGuardsAndResolvers: 'always' },
      { path: 'login', component: BookLogin },
      { path: 'profile', canActivate: [customerGuard], loadComponent: () => import('./book/book-profile').then((m) => m.BookProfile) },
      { path: 'my-bookings', canActivate: [customerGuard], loadComponent: () => import('./book/my-bookings').then((m) => m.MyBookings) },
    ],
  },
  { path: 'account/password', canActivate: [signedInGuard], loadComponent: () => import('./shared/change-password').then((m) => m.ChangePassword) },
  { path: '**', component: NotFound },
];
