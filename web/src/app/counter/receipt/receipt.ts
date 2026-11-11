import { Component, inject } from '@angular/core';
import { formatIstLong, inr } from '../../shared/format';
import { ReceiptService } from './receipt.service';

const MODE_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };

/** The thermal receipt. Hidden on screen; when printing it is the only thing shown. */
@Component({
  selector: 'app-receipt',
  template: `
    @if (svc.receipt(); as r) {
      <div class="receipt" [class.receipt-58]="r.shop.width === 58" [class.receipt-80]="r.shop.width !== 58" data-receipt>
        <p class="r-center r-title">{{ r.shop.name }}</p>
        @if (r.shop.address) { <p class="r-center">{{ r.shop.address }}</p> }
        @if (r.shop.phone) { <p class="r-center">Ph: {{ r.shop.phone }}</p> }
        @if (r.shop.gstin) { <p class="r-center">GSTIN: {{ r.shop.gstin }}</p> }
        <hr />
        @if (r.bill.status === 'void') {
          <p class="r-center r-void">*** VOID ***</p>
          @if (r.bill.void_reason) { <p class="r-center">{{ r.bill.void_reason }}</p> }
          <hr />
        }
        <p class="r-row"><span>Bill #{{ r.bill.bill_no }}</span><span>{{ when(r.bill.created_at) }}</span></p>
        @if (r.bill.customer_name) { <p>Customer: {{ r.bill.customer_name }}</p> }
        <hr />
        @for (i of r.items; track $index) {
          <p>{{ i.name }}</p>
          <p class="r-row"><span>{{ i.qty }} x {{ money(i.unit_price) }}</span><span>{{ money(i.amount) }}</span></p>
        }
        <hr />
        <p class="r-row"><span>Subtotal</span><span>{{ money(r.bill.subtotal) }}</span></p>
        @if (r.bill.discount > 0) {
          <p class="r-row"><span>Discount</span><span>-{{ money(r.bill.discount) }}</span></p>
        }
        <p class="r-row r-total"><span>TOTAL</span><span>{{ money(r.bill.total) }}</span></p>
        <hr />
        @for (p of r.payments; track $index) {
          <p class="r-row">
            <span>{{ label(p.mode) }}{{ p.reference ? ' (' + p.reference + ')' : '' }}</span>
            <span>{{ money(p.amount) }}</span>
          </p>
        }
        @if (r.payments.length === 0) { <p class="r-center">No payment due</p> }
        @if (r.shop.footer) {
          <hr />
          <p class="r-center">{{ r.shop.footer }}</p>
        }
      </div>
    }
  `,
})
export class ReceiptView {
  protected readonly svc = inject(ReceiptService);
  protected readonly money = inr;

  protected when(iso: string): string {
    return formatIstLong(iso);
  }

  protected label(mode: string): string {
    return MODE_LABEL[mode] ?? mode;
  }
}
