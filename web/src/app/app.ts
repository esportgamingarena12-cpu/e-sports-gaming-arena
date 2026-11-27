import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AppUpdate, pageLoadFailed } from './core/app-update';
import { BrandingService } from './core/branding';
import { AuthService } from './core/auth.service';
import { homeFor } from './core/models';
import { ReceiptView } from './counter/receipt/receipt';
import { SideArt } from './shared/art';
import { Icon } from './shared/icon';
import { Logo } from './shared/logo';
import { TimeUpAlerts } from './shared/time-up-alerts';
import { TopTools } from './shared/top-tools';
import { ToastOutlet } from './shared/toast-outlet';

interface NavItem {
  label: string;
  /** Shorter name for the phone bottom bar. */
  short?: string;
  path: string;
  icon: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastOutlet, ReceiptView, Icon, Logo, SideArt, TopTools, TimeUpAlerts],
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** starts watching for new versions of the app (see core/app-update.ts) */
  private readonly appUpdate = inject(AppUpdate);
  private readonly branding = inject(BrandingService);
  /** The shop name from Settings (the built-in name until it is loaded). */
  /** a page could not be loaded (a bad connection): a message with a Try again button replaces the empty page */
  protected readonly pageFailed = pageLoadFailed;
  protected reloadPage(): void {
    location.reload();
  }

  protected readonly appName = computed(() => this.branding.brand().shop_name);

  /** False while the device has no connection (the installed app still opens its saved shell). */
  protected readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  /** The slide-in menu on phones. */
  protected readonly menuOpen = signal(false);
  private readonly url = signal(this.router.url);

  constructor() {
    this.branding.load();
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.menuOpen.set(false);
      pageLoadFailed.set(false);
      setTimeout(() => this.updateSection(), 60); // the page has drawn: work out which section is showing
    });
  }

  /** Staff and admins get the sidebar layout on their own screens; visitors, customers and the public pages get the top-bar layout. */
  protected readonly sidebar = computed(() => this.auth.isStaff() && !this.url().startsWith('/book'));

  /** Where a signed-in admin or staff member goes back to from the public pages. */
  protected readonly dashboardPath = computed(() => homeFor(this.auth.role()));

  /** Role-based navigation. Signed-out visitors only see Book. */
  protected readonly groups = computed<NavGroup[]>(() => {
    switch (this.auth.role()) {
      case 'admin':
        return [
          {
            title: 'Overview',
            items: [
              { label: 'Dashboard', path: '/admin', icon: 'home' },
              { label: 'Reports & Analytics', short: 'Reports', path: '/admin/reports', icon: 'chart' },
            ],
          },
          {
            title: 'Counter',
            items: [
              { label: 'Gaming Systems', short: 'Stations', path: '/counter/stations', icon: 'monitor' },
              { label: 'Bookings', path: '/counter/bookings', icon: 'calendar' },
              { label: 'Canteen', path: '/counter/canteen', icon: 'cup' },
              { label: 'Billing & Payments', short: 'Bills', path: '/counter/bills', icon: 'receipt' },
              { label: 'Inventory', short: 'Stock', path: '/counter/stock', icon: 'box' },
              { label: 'Customers', path: '/counter/customers', icon: 'users' },
              { label: 'Memberships', short: 'Passes', path: '/counter/passes', icon: 'tag' },
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
              { label: 'Games', path: '/admin/games', icon: 'gamepad' },
              { label: 'Booking rules', path: '/admin/booking-settings', icon: 'clock' },
              { label: 'Happy hours', path: '/admin/happy-hours', icon: 'clock' },
              { label: 'Home page wording', short: 'Wording', path: '/admin/branding', icon: 'sliders' },
              { label: 'Staff Management', short: 'Staff', path: '/admin/staff', icon: 'users' },
            ],
          },
        ];
      case 'staff':
        return [
          {
            title: 'Counter',
            items: [
              { label: 'Gaming Systems', short: 'Stations', path: '/counter/stations', icon: 'monitor' },
              { label: 'Bookings', path: '/counter/bookings', icon: 'calendar' },
              { label: 'Canteen', path: '/counter/canteen', icon: 'cup' },
              { label: 'Billing & Payments', short: 'Bills', path: '/counter/bills', icon: 'receipt' },
              { label: 'Inventory', short: 'Stock', path: '/counter/stock', icon: 'box' },
              { label: 'Customers', path: '/counter/customers', icon: 'users' },
              { label: 'Memberships', short: 'Passes', path: '/counter/passes', icon: 'tag' },
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
    if (path === '/account/password') return 'Change password';
    const hit = [...this.items()].sort((a, b) => b.path.length - a.path.length).find((i) => path === i.path || path.startsWith(i.path + '/'));
    return hit?.label ?? '';
  });

  /** Visitor and customer top bar: sections of the booking page, plus My bookings for a customer. */
  protected readonly topLinks = computed<{ label: string; path: string; fragment?: string; icon: string }[]>(() => [
    { label: 'Home', path: '/book', icon: 'home' },
    { label: 'The Studio', path: '/book', fragment: 'studio', icon: 'gamepad' },
    { label: 'Rates', path: '/book', fragment: 'rates', icon: 'rupee' },
    { label: 'Book', path: '/book', fragment: 'book', icon: 'calendar' },
    ...(this.auth.role() === 'customer' ? [{ label: 'My bookings', path: '/book/my-bookings', icon: 'receipt' }] : []),
  ]);

  /** Escape closes the phone menu. */
  @HostListener('document:keydown.escape')
  protected closeMenuOnEscape(): void {
    if (this.menuOpen()) this.menuOpen.set(false);
  }

  /** Which section of the booking page is at the top of the screen ('' = the very top), for the highlighted menu link. */
  protected readonly section = signal('');
  private sectionFrame = 0;

  @HostListener('window:scroll')
  protected onScroll(): void {
    if (this.sectionFrame) return;
    this.sectionFrame = requestAnimationFrame(() => {
      this.sectionFrame = 0;
      this.updateSection();
    });
  }

  private updateSection(): void {
    let cur = '';
    if (this.url().split(/[?#]/)[0] === '/book') {
      for (const id of ['studio', 'rates', 'book']) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) cur = id;
      }
    }
    if (cur !== this.section()) this.section.set(cur);
  }

  /** True when a top-bar link is the one for where the visitor is: Home at the top, a section while it is on screen, or the page itself. */
  protected isActive(l: { label: string; path: string; fragment?: string }): boolean {
    const path = this.url().split(/[?#]/)[0];
    if (l.path === '/book') return path === '/book' && this.section() === (l.fragment ?? '');
    return path === l.path;
  }

  /** True on the plain booking page (no section anchor), for the highlighted Home link. */
  protected readonly isHome = computed(() => this.url().split(/[?#]/)[0] === '/book' && !this.url().includes('#'));

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
