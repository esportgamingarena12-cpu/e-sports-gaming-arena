import { Routes } from '@angular/router';
import { BookingSettings } from './admin/booking/booking-settings';
import { Packages } from './admin/packages/packages';
import { Products } from './admin/products/products';
import { ShopSettings } from './admin/settings/shop-settings';
import { StaffAdmin } from './admin/staff/staff';
import { Stations } from './admin/stations/stations';
import { BookLogin } from './book/book-login';
import { Canteen } from './counter/canteen/canteen';
import { CounterStations } from './counter/stations/stations';
import { StockScreen } from './counter/stock/stock';
import { adminGuard, customerGuard, staffGuard } from './core/guards';
import { Login } from './shared/login';
import { NotFound } from './shared/not-found';
import { Placeholder } from './shared/placeholder';

// Remaining admin / counter / book screens arrive in later phases.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'book' },
  { path: 'login', component: Login },

  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', component: Placeholder, data: { title: 'Admin dashboard' } },
      { path: 'settings', component: ShopSettings },
      { path: 'stations', component: Stations },
      { path: 'packages', component: Packages },
      { path: 'products', component: Products },
      { path: 'booking-settings', component: BookingSettings },
      { path: 'staff', component: StaffAdmin },
    ],
  },
  {
    path: 'counter',
    canActivate: [staffGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'stations' },
      { path: 'stations', component: CounterStations },
      { path: 'canteen', component: Canteen },
      { path: 'stock', component: StockScreen },
    ],
  },
  {
    path: 'book',
    children: [
      { path: '', pathMatch: 'full', component: Placeholder, data: { title: 'Book a slot' } },
      { path: 'login', component: BookLogin },
      {
        path: 'my-bookings',
        canActivate: [customerGuard],
        component: Placeholder,
        data: { title: 'My bookings' },
      },
    ],
  },
  { path: '**', component: NotFound },
];
