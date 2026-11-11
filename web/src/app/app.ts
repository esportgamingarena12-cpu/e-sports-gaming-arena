import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ReceiptView } from './counter/receipt/receipt';
import { ToastOutlet } from './shared/toast-outlet';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastOutlet, ReceiptView],
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly appName = 'E-Sports Gaming Arena';

  /** False while the device has no connection (the installed app still opens its saved shell). */
  protected readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }

  /** Role-based navigation. Signed-out visitors only see Book. */
  protected readonly nav = computed<NavItem[]>(() => {
    switch (this.auth.role()) {
      case 'admin':
        return [
          { label: 'Dashboard', path: '/admin' },
          { label: 'Reports', path: '/admin/reports' },
          { label: 'Settings', path: '/admin/settings' },
          { label: 'Stations', path: '/admin/stations' },
          { label: 'Packages', path: '/admin/packages' },
          { label: 'Products', path: '/admin/products' },
          { label: 'Booking', path: '/admin/booking-settings' },
          { label: 'Staff', path: '/admin/staff' },
          { label: 'Counter', path: '/counter/stations' },
          { label: 'Bookings', path: '/counter/bookings' },
          { label: 'Canteen', path: '/counter/canteen' },
          { label: 'Bills', path: '/counter/bills' },
          { label: 'Stock', path: '/counter/stock' },
        ];
      case 'staff':
        return [
          { label: 'Stations', path: '/counter/stations' },
          { label: 'Bookings', path: '/counter/bookings' },
          { label: 'Canteen', path: '/counter/canteen' },
          { label: 'Bills', path: '/counter/bills' },
          { label: 'Stock', path: '/counter/stock' },
          { label: 'Today', path: '/counter/today' },
        ];
      case 'customer':
        return [
          { label: 'Book', path: '/book' },
          { label: 'My bookings', path: '/book/my-bookings' },
        ];
      default:
        return [{ label: 'Book', path: '/book' }];
    }
  });

  protected async logout(): Promise<void> {
    const wasStaff = this.auth.isStaff();
    await this.auth.signOut();
    await this.router.navigateByUrl(wasStaff ? '/login' : '/book');
  }
}
