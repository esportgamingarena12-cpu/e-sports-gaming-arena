import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { ReceiptService } from '../receipt/receipt.service';
import { CounterStations } from './stations';

/** A database stand-in that answers each table with the rows given (every other table has no rows). */
function dbWith(rows: Record<string, unknown[]>): unknown {
  const chain = (table: string): unknown =>
    new Proxy(function () {}, {
      get: (_t, key) => (key === 'then' ? (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null, count: 0 }) : chain(table)),
      apply: () => chain(table),
    });
  return {
    from: (table: string) => chain(table),
    rpc: () => chain('rpc'),
    channel: () => chain('channel'),
    removeChannel: () => Promise.resolve('ok'),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  };
}

const session = (over: Record<string, unknown>) => ({
  id: 5,
  station_id: 1,
  customer_name: 'Asha',
  customer_phone: null,
  status: 'running',
  package_name: null,
  rate_per_hour: 80,
  block_min: 15,
  min_bill_min: 30,
  package_minutes: null,
  package_price: null,
  pass_id: null,
  pass_name: null,
  pass_minutes_left: null,
  started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  paused_at: null,
  paused_seconds: 0,
  ended_at: null,
  alarm_minutes: null,
  alarm_extra_minutes: 0,
  overtime_grace_min: 10,
  overtime_mode: null,
  overtime_amount: null,
  happy_pct: 0,
  happy_name: null,
  ...over,
});

async function draw(sessions: unknown[]): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [CounterStations],
    providers: [
      provideRouter([]),
      {
        provide: SupabaseService,
        useValue: { client: dbWith({ stations: [{ id: 1, name: 'PC 1', type: 'pc', rate_per_hour: 90, sort_order: 1 }], sessions }) },
      },
      { provide: AuthService, useValue: { profile: signal(null), role: signal('admin'), ready: signal(true), isStaff: signal(true) } },
      { provide: ReceiptService, useValue: { printBill: () => Promise.resolve(null) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(CounterStations);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 30));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('the Happy hour tag on a running session', () => {
  it('shows on a session that was started in a happy hour, with the percent', async () => {
    const el = await draw([session({ happy_pct: 20, happy_name: 'Weekday afternoon' })]);
    const tag = el.querySelector('[data-happy-tag]');
    expect(tag).not.toBeNull();
    expect(tag!.textContent).toContain('Happy hour');
    expect(tag!.textContent).toContain('20%');
    expect(el.textContent).toContain('happy hour');
  });

  it('is not there for a session without a discount', async () => {
    const el = await draw([session({ happy_pct: 0 })]);
    expect(el.querySelector('[data-station="PC 1"]')).not.toBeNull();
    expect(el.querySelector('[data-happy-tag]')).toBeNull();
  });
});
