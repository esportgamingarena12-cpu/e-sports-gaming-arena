import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SalesSummary } from './report-utils';
import { SalesSummaryView } from './sales-summary';

const base: SalesSummary = {
  from: '2026-11-26',
  to: '2026-11-26',
  bills: 3,
  net_sales: 500,
  gaming: 400,
  canteen: 100,
  passes: 0,
  discounts: 0,
  void_count: 0,
  void_value: 0,
  payments: { cash: 500, upi: 0, card: 0 },
};

function draw(s: SalesSummary): HTMLElement {
  const f = TestBed.createComponent(SalesSummaryView);
  f.componentRef.setInput('s', s);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('sales summary: the Happy hour discount line', () => {
  it('shows the discount given and the number of sessions when there were happy hour sessions', () => {
    const el = draw({ ...base, happy_sessions: 3, happy_discount: 64 });
    expect(el.querySelector('[data-happy-line]')).not.toBeNull();
    expect(el.querySelector('[data-happy-discount]')!.textContent).toContain('64');
    expect(el.querySelector('[data-happy-line]')!.textContent).toContain('3 sessions');
  });
  it('says "1 session" for one', () => {
    expect(draw({ ...base, happy_sessions: 1, happy_discount: 18 }).querySelector('[data-happy-line]')!.textContent).toContain('1 session');
    expect(draw({ ...base, happy_sessions: 1, happy_discount: 18 }).querySelector('[data-happy-line]')!.textContent).not.toContain('1 sessions');
  });
  it('is not shown when there were none, or when the database does not send it yet', () => {
    expect(draw({ ...base, happy_sessions: 0, happy_discount: 0 }).querySelector('[data-happy-line]')).toBeNull();
    expect(draw(base).querySelector('[data-happy-line]')).toBeNull();
  });
  it('the other figures are unchanged', () => {
    const el = draw({ ...base, happy_sessions: 2, happy_discount: 30 });
    expect(el.querySelector('[data-net]')!.textContent).toContain('500');
    expect(el.querySelector('[data-discounts]')).not.toBeNull();
  });
});
