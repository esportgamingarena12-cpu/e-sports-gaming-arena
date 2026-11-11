import { Routes } from '@angular/router';
import { Dashboard } from './admin/reports/dashboard';
import { Reports } from './admin/reports/reports';
import { Today } from './counter/today/today';
import { BookingSettings } from './admin/booking/booking-settings';
import { Packages } from './admin/packages/packages';
import { PassTypes } from './admin/passes/pass-types';
import { Products } from './admin/products/products';
import { ShopSettings } from './admin/settings/shop-settings';
import { StaffAdmin } from './admin/staff/staff';
import { Stations } from './admin/stations/stations';
import { BookHome } from './book/book-home';
import { BookLogin } from './book/book-login';
import { BookProfile } from './book/book-profile';
import { MyBookings } from './book/my-bookings';
import { Bills } from './counter/bills/bills';
import { CounterBookings } from './counter/bookings/bookings';
import { Canteen } from './counter/canteen/canteen';
import { Customers } from './counter/customers/customers';
import { CounterPasses } from './counter/passes/passes';
import { CounterStations } from './counter/stations/stations';
import { StockScreen } from './counter/stock/stock';
import { adminGuard, customerGuard, staffGuard } from './core/guards';
import { Login } from './shared/login';
import { NotFound } from './shared/not-found';

// Remaining admin / counter / book screens arrive in later phases.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'book' },
  { path: 'login', component: Login },

  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', component: Dashboard },
      { path: 'reports', component: Reports },
      { path: 'settings', component: ShopSettings },
      { path: 'stations', component: Stations },
      { path: 'packages', component: Packages },
      { path: 'passes', component: PassTypes },
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
      { path: 'bookings', component: CounterBookings },
      { path: 'canteen', component: Canteen },
      { path: 'bills', component: Bills },
      { path: 'stock', component: StockScreen },
      { path: 'customers', component: Customers },
      { path: 'passes', component: CounterPasses },
      { path: 'today', component: Today },
    ],
  },
  {
    path: 'book',
    children: [
      { path: '', pathMatch: 'full', component: BookHome },
      { path: 'login', component: BookLogin },
      { path: 'profile', canActivate: [customerGuard], component: BookProfile },
      { path: 'my-bookings', canActivate: [customerGuard], component: MyBookings },
    ],
  },
  { path: '**', component: NotFound },
];
