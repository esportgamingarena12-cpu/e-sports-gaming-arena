import { computed, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ServerClock } from '../core/server-clock';
import { SessionSnapshot } from '../core/pricing';
import { SupabaseService } from '../core/supabase.service';
import { friendlyError } from '../shared/errors';
import { reservedByProduct } from './stock-utils';

export interface Station {
  id: number;
  name: string;
  type: string;
  rate_per_hour: number;
  sort_order: number;
}

export interface OpenSession extends SessionSnapshot {
  id: number;
  station_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  package_name: string | null;
  status: 'running' | 'paused' | 'ended';
}

export interface TabLine {
  session_id: number;
  product_id: number;
  qty: number;
  name: string;
  price: number;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  stock_qty: number;
  low_stock_level: number;
  track_stock: boolean;
  active: boolean;
}

/** An active booking (confirmed or checked in) around now, for station cards and the walk-in warning. */
export interface BookingLite {
  id: number;
  station_id: number;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'checked_in';
  slots: number;
  customer_name: string;
  customer_phone: string | null;
}

export interface Pack {
  id: number;
  name: string;
  minutes: number;
  price: number;
  station_type: string;
}

const SESSION_COLUMNS =
  'id, station_id, customer_name, customer_phone, status, package_name, rate_per_hour, block_min, ' +
  'min_bill_min, package_minutes, package_price, started_at, paused_at, paused_seconds, ended_at';

/**
 * Everything the counter screens need: stations, open sessions, tabs and packages.
 * Reloads on every Realtime change, every 60 seconds, and when the tab becomes visible again.
 * Provided per screen (not root) so the subscription ends when the screen is left.
 */
@Injectable()
export class CounterStore {
  private readonly sb = inject(SupabaseService).client;
  private readonly clock = inject(ServerClock);

  readonly stations = signal<Station[]>([]);
  readonly sessions = signal<OpenSession[]>([]);
  readonly tabs = signal<TabLine[]>([]);
  readonly packages = signal<Pack[]>([]);
  readonly products = signal<Product[]>([]);
  readonly bookings = signal<BookingLite[]>([]);
  readonly loaded = signal(false);
  readonly live = signal(false);
  readonly error = signal<string | null>(null);
  /** Goes up on every Realtime event, so screens can reload extra data (e.g. the stock log). */
  readonly changes = signal(0);

  readonly sessionByStation = computed(() => new Map(this.sessions().map((s) => [s.station_id, s])));
  readonly stationById = computed(() => new Map(this.stations().map((s) => [s.id, s])));
  /** Quantity of each product already held by open tabs on any station. */
  readonly reserved = computed(() =>
    reservedByProduct(this.tabs(), new Set(this.sessions().map((s) => s.id))),
  );

  private channel?: RealtimeChannel;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.load();
  };

  start(): void {
    void this.clock.sync();
    void this.load();
    this.channel = this.sb
      .channel('counter-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => this.queueReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_items' }, () => this.queueReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => this.queueReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_moves' }, () => this.queueReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => this.queueReload())
      .subscribe((status) => this.live.set(status === 'SUBSCRIBED'));
    this.refreshTimer = setInterval(() => void this.load(), 60_000);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    if (this.channel) void this.sb.removeChannel(this.channel);
    clearInterval(this.refreshTimer);
    clearTimeout(this.debounce);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private queueReload(): void {
    this.changes.update((n) => n + 1);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.load(), 100);
  }

  async load(): Promise<void> {
    const now = Date.now();
    const [st, se, tab, pk, pr, bk] = await Promise.all([
      this.sb
        .from('stations')
        .select('id, name, type, rate_per_hour, sort_order')
        .eq('active', true)
        .order('sort_order')
        .order('name'),
      this.sb.from('sessions').select(SESSION_COLUMNS).in('status', ['running', 'paused', 'ended']),
      this.sb.from('tab_items').select('session_id, product_id, qty, products(name, price)'),
      this.sb
        .from('packages')
        .select('id, name, minutes, price, station_type')
        .eq('active', true)
        .order('minutes'),
      this.sb
        .from('products')
        .select('id, name, category, price, stock_qty, low_stock_level, track_stock, active')
        .order('category')
        .order('name'),
      this.sb
        .from('bookings')
        .select('id, station_id, start_at, end_at, status, slots, customers(name, phone)')
        .in('status', ['confirmed', 'checked_in'])
        .lt('start_at', new Date(now + 24 * 3600_000).toISOString())
        .gt('end_at', new Date(now - 3600_000).toISOString())
        .order('start_at'),
    ]);
    const failed = st.error ?? se.error ?? tab.error ?? pk.error ?? pr.error ?? bk.error;
    if (failed) {
      this.error.set(friendlyError(failed));
      return;
    }
    this.error.set(null);
    this.stations.set((st.data ?? []) as unknown as Station[]);
    this.sessions.set((se.data ?? []) as unknown as OpenSession[]);
    this.packages.set((pk.data ?? []) as unknown as Pack[]);
    this.products.set(
      ((pr.data ?? []) as unknown as Product[]).map((p) => ({ ...p, price: Number(p.price) })),
    );
    this.bookings.set(
      (
        (bk.data ?? []) as unknown as {
          id: number;
          station_id: number;
          start_at: string;
          end_at: string;
          status: 'confirmed' | 'checked_in';
          slots: number;
          customers: { name: string; phone: string | null } | null;
        }[]
      ).map((b) => ({
        id: b.id,
        station_id: b.station_id,
        start_at: b.start_at,
        end_at: b.end_at,
        status: b.status,
        slots: b.slots,
        customer_name: b.customers?.name ?? 'Customer',
        customer_phone: b.customers?.phone ?? null,
      })),
    );
    this.tabs.set(
      (
        (tab.data ?? []) as unknown as {
          session_id: number;
          product_id: number;
          qty: number;
          products: { name: string; price: number } | null;
        }[]
      )
        .filter((t) => t.products)
        .map((t) => ({
          session_id: t.session_id,
          product_id: t.product_id,
          qty: t.qty,
          name: t.products!.name,
          price: Number(t.products!.price),
        })),
    );
    this.loaded.set(true);
  }

  /** Like call(), but also returns the value the function returned (e.g. end_session's charge). */
  async callData(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
    const { data, error } = await this.sb.rpc(fn, args);
    await this.load();
    return { data, error: error ? friendlyError(error) : null };
  }

  /** Calls a database function, reloads, and returns an error message (or null on success). */
  async call(fn: string, args: Record<string, unknown>): Promise<string | null> {
    const { error } = await this.sb.rpc(fn, args);
    await this.load();
    return error ? friendlyError(error) : null;
  }
}
