import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';

export interface ReceiptData {
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    footer: string;
    width: 58 | 80;
  };
  bill: {
    bill_no: number;
    created_at: string;
    customer_name: string | null;
    subtotal: number;
    discount: number;
    total: number;
    status: string;
    void_reason: string | null;
  };
  items: { kind: string; name: string; qty: number; unit_price: number; amount: number }[];
  payments: { mode: string; amount: number; reference: string | null }[];
}

/**
 * Loads a saved bill and prints it on the thermal printer. The receipt is rendered by
 * <app-receipt> (hidden on screen, the only thing visible when printing).
 */
@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private readonly sb = inject(SupabaseService).client;

  readonly receipt = signal<ReceiptData | null>(null);

  /** Returns an error message, or null when the print dialog was opened. */
  async printBill(billNo: number): Promise<string | null> {
    const [bill, shop] = await Promise.all([
      this.sb
        .from('bills')
        .select(
          'bill_no, created_at, customer_name, subtotal, discount, total, status, void_reason, ' +
            'bill_items(kind, name, qty, unit_price, amount, id), payments(mode, amount, reference, id)',
        )
        .eq('bill_no', billNo)
        .maybeSingle(),
      this.sb
        .from('settings')
        .select('shop_name, address, phone, gstin, receipt_footer, receipt_width')
        .maybeSingle(),
    ]);
    if (bill.error) return friendlyError(bill.error);
    if (shop.error) return friendlyError(shop.error);
    if (!bill.data) return 'Bill not found';

    const b = bill.data as unknown as ReceiptData['bill'] & {
      bill_items: (ReceiptData['items'][number] & { id: number })[];
      payments: (ReceiptData['payments'][number] & { id: number })[];
    };
    const s = shop.data;
    this.receipt.set({
      shop: {
        name: s?.shop_name ?? 'E-Sports Gaming Arena',
        address: s?.address ?? null,
        phone: s?.phone ?? null,
        gstin: s?.gstin ?? null,
        footer: s?.receipt_footer ?? '',
        width: s?.receipt_width === 58 ? 58 : 80,
      },
      bill: {
        bill_no: b.bill_no,
        created_at: b.created_at,
        customer_name: b.customer_name,
        subtotal: Number(b.subtotal),
        discount: Number(b.discount),
        total: Number(b.total),
        status: b.status,
        void_reason: b.void_reason,
      },
      items: [...b.bill_items]
        .sort((x, y) => x.id - y.id)
        .map((i) => ({ kind: i.kind, name: i.name, qty: i.qty, unit_price: Number(i.unit_price), amount: Number(i.amount) })),
      payments: [...b.payments]
        .sort((x, y) => x.id - y.id)
        .map((p) => ({ mode: p.mode, amount: Number(p.amount), reference: p.reference })),
    });

    this.setPageSize(this.receipt()!.shop.width);
    // let Angular draw the receipt before the print dialog opens
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.print();
    return null;
  }

  /** Thermal rolls: the page is as wide as the roll, with no margin, and as long as needed. */
  private setPageSize(widthMm: number): void {
    let el = document.getElementById('receipt-page-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'receipt-page-style';
      document.head.appendChild(el);
    }
    el.textContent = `@media print { @page { size: ${widthMm}mm auto; margin: 0; } }`;
  }
}
