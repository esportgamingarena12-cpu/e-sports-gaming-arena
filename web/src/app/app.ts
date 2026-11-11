import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { ReceiptView } from './counter/receipt/receipt';
import { Icon } from './shared/icon';
import { Logo } from './shared/logo';
import { ToastOutlet } from './shared/toast-outlet';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastOutlet, ReceiptView, Icon, Logo],
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly appName = 'E-Sports Gaming Arena';

  /** False while the device has no connection (the installed app still opens its saved shell). */
  protected readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  /** The slide-in menu on phones. */
  protected readonly menuOpen = signal(false);
  private readonly url = signal(this.router.url);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.menuOpen.set(false);
    });
  }

  /** Staff and admins get the sidebar layout; visitors and customers get the top-bar layout. */
  protected readonly sidebar = computed(() => this.auth.isStaff());

  /** Role-based navigation. Signed-out visitors only see Book. */
  protected readonly groups = computed<NavGroup[]>(() => {
    switch (this.auth.role()) {
      case 'admin':
        return [
          {
            title: 'Overview',
            items: [
              { label: 'Dashboard', path: '/admin', icon: 'home' },
              { label: 'Reports', path: '/admin/reports', icon: 'chart' },
            ],
          },
          {
            title: 'Counter',
            items: [
              { label: 'Stations', path: '/counter/stations', icon: 'monitor' },
              { label: 'Bookings', path: '/counter/bookings', icon: 'calendar' },
              { label: 'Canteen', path: '/counter/canteen', icon: 'cup' },
              { label: 'Bills', path: '/counter/bills', icon: 'receipt' },
              { label: 'Stock', path: '/counter/stock', icon: 'box' },
              { label: 'Passes', path: '/counter/passes', icon: 'tag' },
            ],
          },
          {
            title: 'Setup',
            items: [
              { label: 'Settings', path: '/admin/settings', icon: 'sliders' },
              { label: 'Station setup', path: '/admin/stations', icon: 'monitor' },
              { label: 'Packages', path: '/admin/packages', icon: 'box' },
              { label: 'Pass setup', path: '/admin/passes', icon: 'tag' },
              { label: 'Products', path: '/admin/products', icon: 'tag' },
              { label: 'Booking rules', path: '/admin/booking-settings', icon: 'clock' },
              { label: 'Staff', path: '/admin/staff', icon: 'users' },
            ],
          },
        ];
      case 'staff':
        return [
          {
            title: 'Counter',
            items: [
              { label: 'Stations', path: '/counter/stations', icon: 'monitor' },
              { label: 'Bookings', path: '/counter/bookings', icon: 'calendar' },
              { label: 'Canteen', path: '/counter/canteen', icon: 'cup' },
              { label: 'Bills', path: '/counter/bills', icon: 'receipt' },
              { label: 'Stock', path: '/counter/stock', icon: 'box' },
              { label: 'Passes', path: '/counter/passes', icon: 'tag' },
              { label: 'Today', path: '/counter/today', icon: 'clock' },
            ],
          },
        ];
      case 'customer':
        return [
          {
            title: 'Menu',
            items: [
              { label: 'Book', path: '/book', icon: 'play' },
              { label: 'My bookings', path: '/book/my-bookings', icon: 'calendar' },
            ],
          },
        ];
      default:
        return [{ title: 'Menu', items: [{ label: 'Book', path: '/book', icon: 'play' }] }];
    }
  });

  protected readonly items = computed(() => this.groups().flatMap((g) => g.items));

  /** The short bottom bar on phones (staff and admin). The rest is under "Menu". */
  protected readonly tabs = computed<NavItem[]>(() => {
    const all = this.items();
    const pick = (...paths: string[]) => paths.map((p) => all.find((i) => i.path === p)).filter((i): i is NavItem => !!i);
    return this.auth.role() === 'admin'
      ? pick('/admin', '/counter/stations', '/counter/bookings', '/counter/bills')
      : pick('/counter/stations', '/counter/bookings', '/counter/canteen', '/counter/bills');
  });

  /** The name of the current screen, shown in the top bar. */
  protected readonly title = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    const hit = [...this.items()].sort((a, b) => b.path.length - a.path.length).find((i) => path === i.path || path.startsWith(i.path + '/'));
    return hit?.label ?? '';
  });

  protected readonly roleLabel = computed(() => {
    const r = this.auth.role();
    return r === 'admin' ? 'Owner' : r === 'staff' ? 'Staff' : 'Customer';
  });

  protected async logout(): Promise<void> {
    const wasStaff = this.auth.isStaff();
    this.menuOpen.set(false);
    await this.auth.signOut();
    await this.router.navigateByUrl(wasStaff ? '/login' : '/book');
  }
}
