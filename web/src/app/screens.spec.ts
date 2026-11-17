import { signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SupabaseService } from './core/supabase.service';
import { Dashboard } from './admin/reports/dashboard';
import { Bills } from './counter/bills/bills';
import { CounterStations } from './counter/stations/stations';
import { Customers } from './counter/customers/customers';
import { StockScreen } from './counter/stock/stock';
import { ReceiptService } from './counter/receipt/receipt.service';

/**
 * Smoke test: each staff screen can be created and drawn. This is what catches a missing provider or a template mistake,
 * which in the browser shows up as a blank screen. The database is a stand-in that answers every call with "no rows".
 */
function emptyDb(): unknown {
  const answer = { data: [], error: null, count: 0 };
  const chain = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, key) => (key === 'then' ? (resolve: (v: unknown) => unknown) => resolve(answer) : chain()),
      apply: () => chain(),
    });
  return { from: chain, rpc: chain, channel: chain, removeChannel: () => Promise.resolve('ok'), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } };
}

const screens: [string, Type<unknown>][] = [
  ['Bills (with the Pending list)', Bills],
  ['Stock', StockScreen],
  ['Stations', CounterStations],
  ['Customers', Customers],
  ['Admin dashboard', Dashboard],
];

describe('staff screens draw without errors', () => {
  for (const [name, component] of screens) {
    it(name, async () => {
      await TestBed.configureTestingModule({
        imports: [component],
        providers: [
          provideRouter([]),
          { provide: SupabaseService, useValue: { client: emptyDb() } },
          { provide: AuthService, useValue: { profile: signal(null), role: signal('admin'), ready: signal(true), isStaff: signal(true) } },
          { provide: ReceiptService, useValue: { printBill: () => Promise.resolve(null) } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent?.trim().length ?? 0).toBeGreaterThan(0);
      fixture.destroy();
    });
  }
});
