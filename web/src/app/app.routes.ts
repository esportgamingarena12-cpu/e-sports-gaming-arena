import { Routes } from '@angular/router';
import { StaffAdmin } from './admin/staff/staff';
import { BookLogin } from './book/book-login';
import { adminGuard, customerGuard, staffGuard } from './core/guards';
import { Login } from './shared/login';
import { NotFound } from './shared/not-found';
import { Placeholder } from './shared/placeholder';

// Real screens for admin / counter / book arrive in later phases.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'book' },
  { path: 'login', component: Login },

  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', component: Placeholder, data: { title: 'Admin dashboard' } },
      { path: 'staff', component: StaffAdmin },
    ],
  },
  {
    path: 'counter',
    canActivate: [staffGuard],
    children: [{ path: '', pathMatch: 'full', component: Placeholder, data: { title: 'Counter' } }],
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
