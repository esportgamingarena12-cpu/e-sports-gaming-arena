import { Component, computed, HostListener, inject, OnDestroy, OnInit, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { todayIst } from './format';
import { Icon } from './icon';

interface Hit {
  id: number;
  name: string;
  phone: string | null;
}

export interface Alert {
  key: string;
  text: string;
  path: string;
}

/** What the bell shows: only things that need attention. Pure, so it can be tested. */
export function buildAlerts(a: { startingSoon: number; noShowsToday: number; lowStock: string[] }): Alert[] {
  const out: Alert[] = [];
  if (a.startingSoon > 0) {
    out.push({
      key: 'soon',
      text: `${a.startingSoon} booking${a.startingSoon === 1 ? '' : 's'} starting within the hour`,
      path: '/counter/bookings',
    });
  }
  if (a.noShowsToday > 0) {
    out.push({ key: 'noshow', text: `${a.noShowsToday} no-show${a.noShowsToday === 1 ? '' : 's'} today`, path: '/counter/bookings' });
  }
  if (a.lowStock.length > 0) {
    const shown = a.lowStock.slice(0, 3).join(', ') + (a.lowStock.length > 3 ? ` and ${a.lowStock.length - 3} more` : '');
    out.push({ key: 'stock', text: `Low stock: ${shown}`, path: '/counter/stock' });
  }
  return out;
}

/** Initials for the avatar circle: "Asha Rao" -> "AR", "owner@x.in" -> "O". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').split('@')[0].trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Search box (jumps to a customer), alerts bell and user menu for the staff top bar. */
@Component({
  selector: 'app-top-tools',
  imports: [Icon, RouterLink],
  template: `
    <div class="flex items-center gap-2">
      <!-- search -->
      <div class="relative hidden md:block">
        <label class="flex h-10 w-64 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-400 focus-within:border-cyan-400/70 lg:w-80">
          <app-icon name="search" [size]="18" />
          <input #box class="w-full min-w-0 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" placeholder="Search customers (Ctrl + K)"
                 aria-label="Search customers" [value]="query()" (input)="onQuery($any($event.target).value)" (focus)="searchOpen.set(true)" data-search-box />
        </label>
        @if (searchOpen() && query().trim().length >= 2) {
          <div class="absolute right-0 z-50 mt-1 w-full min-w-72 overflow-hidden rounded-lg border border-violet-500/30 bg-slate-900 shadow-2xl" data-search-results>
            @for (h of hits(); track h.id) {
              <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-800" (click)="goTo(h)" [attr.data-hit]="h.name">
                <span class="font-medium">{{ h.name }}</span> <span class="text-slate-400">{{ h.phone }}</span>
              </button>
            } @empty {
              <p class="px-3 py-2 text-sm text-slate-400">{{ searching() ? 'Searching…' : 'No customer found.' }}</p>
            }
          </div>
        }
      </div>

      <!-- bell -->
      <div class="relative">
        <button type="button" class="btn relative !p-2" (click)="toggle('bell')" aria-label="Alerts" [attr.aria-expanded]="open() === 'bell'" data-bell>
          <app-icon name="bell" />
          @if (alerts().length > 0) {
            <span class="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white" data-bell-count>{{ alerts().length }}</span>
          }
        </button>
        @if (open() === 'bell') {
          <div class="absolute right-0 z-50 mt-1 w-72 max-w-[85vw] rounded-lg border border-violet-500/30 bg-slate-900 p-1 shadow-2xl" data-bell-panel>
            @for (a of alerts(); track a.key) {
              <a [routerLink]="a.path" class="block rounded px-3 py-2 text-sm hover:bg-slate-800" (click)="open.set(null)">{{ a.text }}</a>
            } @empty {
              <p class="px-3 py-2 text-sm text-slate-400">Nothing needs attention.</p>
            }
          </div>
        }
      </div>

      <!-- user -->
      @if (auth.profile(); as p) {
        <div class="relative">
          <button type="button" class="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-800" (click)="toggle('user')" [attr.aria-expanded]="open() === 'user'" aria-label="Account menu" data-user-menu>
            <span class="grid size-9 place-items-center rounded-full bg-linear-to-br from-violet-500 to-cyan-400 text-sm font-bold text-slate-950">{{ initials(p.full_name || p.email) }}</span>
            <span class="hidden text-left leading-tight sm:block">
              <span class="block max-w-32 truncate text-sm font-medium">{{ p.full_name || p.email }}</span>
              <span class="block text-xs text-slate-400">{{ role() }}</span>
            </span>
            <span class="hidden text-slate-400 sm:block"><app-icon name="chevron" [size]="16" /></span>
          </button>
          @if (open() === 'user') {
            <div class="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-violet-500/30 bg-slate-900 p-1 shadow-2xl">
              <p class="truncate px-3 py-2 text-xs text-slate-400">{{ p.email }}</p>
              <button type="button" class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-800" (click)="logout.emit()" data-logout>
                <app-icon name="logout" [size]="16" /> Logout
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TopTools implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly logout = output<void>();

  protected readonly query = signal('');
  protected readonly hits = signal<Hit[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly open = signal<'bell' | 'user' | null>(null);
  protected readonly alerts = signal<Alert[]>([]);
  protected readonly role = computed(() => (this.auth.role() === 'admin' ? 'Owner' : 'Staff'));
  protected initials = initials;
  private timer?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setInterval>;
  private seq = 0;

  ngOnInit(): void {
    void this.refreshAlerts();
    this.poll = setInterval(() => void this.refreshAlerts(), 60_000);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    clearInterval(this.poll);
  }

  protected toggle(which: 'bell' | 'user'): void {
    this.open.set(this.open() === which ? null : which);
    if (which === 'bell' && this.open() === 'bell') void this.refreshAlerts();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      (document.querySelector('[data-search-box]') as HTMLInputElement | null)?.focus();
    }
    if (e.key === 'Escape') {
      this.open.set(null);
      this.searchOpen.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('app-top-tools')) {
      this.open.set(null);
      this.searchOpen.set(false);
    }
  }

  protected onQuery(v: string): void {
    this.query.set(v);
    this.searchOpen.set(true);
    clearTimeout(this.timer);
    if (v.trim().length < 2) {
      this.hits.set([]);
      return;
    }
    this.timer = setTimeout(() => void this.search(v.trim()), 250);
  }

  private async search(q: string): Promise<void> {
    const my = ++this.seq;
    this.searching.set(true);
    const { data } = await this.sb.rpc('customer_list', { p_search: q });
    if (my !== this.seq) return;
    this.searching.set(false);
    this.hits.set(((data ?? []) as Hit[]).slice(0, 6));
  }

  protected goTo(h: Hit): void {
    this.query.set('');
    this.hits.set([]);
    this.searchOpen.set(false);
    void this.router.navigate(['/counter/customers'], { queryParams: { open: h.id } });
  }

  private async refreshAlerts(): Promise<void> {
    const now = new Date();
    const hour = new Date(now.getTime() + 3_600_000);
    const dayStart = new Date(`${todayIst()}T00:00:00+05:30`);
    const [soon, noShows, stock] = await Promise.all([
      this.sb.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').gte('start_at', now.toISOString()).lte('start_at', hour.toISOString()),
      this.sb.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'no_show').gte('start_at', dayStart.toISOString()),
      this.sb.from('products').select('name, stock_qty, low_stock_level, track_stock, active'),
    ]);
    const low = ((stock.data ?? []) as { name: string; stock_qty: number; low_stock_level: number; track_stock: boolean; active: boolean }[])
      .filter((p) => p.active && p.track_stock && p.stock_qty <= p.low_stock_level)
      .map((p) => p.name);
    this.alerts.set(buildAlerts({ startingSoon: soon.count ?? 0, noShowsToday: noShows.count ?? 0, lowStock: low }));
  }
}
