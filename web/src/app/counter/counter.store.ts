import { computed, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ServerClock } from '../core/server-clock';
import { SessionSnapshot } from '../core/pricing';
import { SupabaseService } from '../core/supabase.service';
import { friendlyError } from '../shared/errors';

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
  qty: number;
  name: string;
  price: number;
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
  readonly loaded = signal(false);
  readonly live = signal(false);
  readonly error = signal<string | null>(null);

  readonly sessionByStation = computed(() => new Map(this.sessions().map((s) => [s.station_id, s])));

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
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.load(), 100);
  }

  async load(): Promise<void> {
    const [st, se, tab, pk] = await Promise.all([
      this.sb
        .from('stations')
        .select('id, name, type, rate_per_hour, sort_order')
        .eq('active', true)
        .order('sort_order')
        .order('name'),
      this.sb.from('sessions').select(SESSION_COLUMNS).in('status', ['running', 'paused', 'ended']),
      this.sb.from('tab_items').select('session_id, qty, products(name, price)'),
      this.sb
        .from('packages')
        .select('id, name, minutes, price, station_type')
        .eq('active', true)
        .order('minutes'),
    ]);
    const failed = st.error ?? se.error ?? tab.error ?? pk.error;
    if (failed) {
      this.error.set(friendlyError(failed));
      return;
    }
    this.error.set(null);
    this.stations.set((st.data ?? []) as unknown as Station[]);
    this.sessions.set((se.data ?? []) as unknown as OpenSession[]);
    this.packages.set((pk.data ?? []) as unknown as Pack[]);
    this.tabs.set(
      ((tab.data ?? []) as unknown as { session_id: number; qty: number; products: { name: string; price: number } | null }[])
        .filter((t) => t.products)
        .map((t) => ({ session_id: t.session_id, qty: t.qty, name: t.products!.name, price: Number(t.products!.price) })),
    );
    this.loaded.set(true);
  }

  /** Calls a database function, reloads, and returns an error message (or null on success). */
  async call(fn: string, args: Record<string, unknown>): Promise<string | null> {
    const { error } = await this.sb.rpc(fn, args);
    await this.load();
    return error ? friendlyError(error) : null;
  }
}
