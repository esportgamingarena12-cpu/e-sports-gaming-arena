import { Routes } from '@angular/router';
import { NotFound } from './shared/not-found';
import { Placeholder } from './shared/placeholder';

// Role guards and real screens arrive in Phase 2+.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'book' },
  { path: 'login', component: Placeholder, data: { title: 'Staff login' } },
  { path: 'admin', component: Placeholder, data: { title: 'Admin' } },
  { path: 'counter', component: Placeholder, data: { title: 'Counter' } },
  { path: 'book', component: Placeholder, data: { title: 'Book a slot' } },
  { path: '**', component: NotFound },
];
