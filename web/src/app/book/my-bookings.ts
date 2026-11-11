import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STATUS_LABEL } from '../counter/booking-utils';
import { formatIst, formatIstLong, formatIstTime, inr, todayIst } from '../shared/format';
import { BookingInfo, BookingService, FreeSlot, MyBill } from './booking.service';
import { canChangeBooking, lengthLabel, PortalBooking, splitBookings, typeLabel } from './portal';

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

@Component({
  selector: 'app-my-bookings',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-2xl space-y-4 p-4">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-xl font-semibold">My bookings</h1>
        <a routerLink="/book" class="btn-primary" data-new>Book a slot</a>
      </div>

      @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
      @if (notice()) { <p class="text-sm text-emerald-300" role="status" data-notice>{{ notice() }}</p> }

      @if (!loaded()) {
        <p class="text-sm text-slate-400">Loading…</p>
      } @else {
        <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Upcoming</h2>
        @if (groups().upcoming.length === 0) {
          <p class="text-sm text-slate-400" data-none>No upcoming bookings.</p>
        }
        @for (b of groups().upcoming; track b.id) {
          <article class="rounded border border-slate-700 bg-slate-900 p-3 space-y-2" data-booking [attr.data-id]="b.id">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-medium">{{ label(b.station_type) }} · {{ len(b.slots) }}</p>
                <p class="text-sm text-slate-300">{{ long(b.start_at) }} – {{ time(b.end_at) }}</p>
              </div>
              <span class="rounded bg-slate-800 px-2 py-0.5 text-xs">{{ status(b) }}</span>
            </div>

            @if (b.status === 'confirmed') {
              @if (canChange(b)) {
                @if (confirmCancel() === b.id) {
                  <div class="flex gap-2">
                    <button type="button" class="btn-danger flex-1" [disabled]="busy()" (click)="cancel(b)" data-cancel-yes>
                      Yes, cancel it
                    </button>
                    <button type="button" class="btn" (click)="confirmCancel.set(null)">Keep it</button>
                  </div>
                } @else {
                  <div class="flex gap-2">
                    <button type="button" class="btn flex-1" (click)="openChange(b)" data-change>Change time</button>
                    <button type="button" class="btn flex-1" (click)="confirmCancel.set(b.id)" data-cancel>Cancel</button>
                  </div>
                }
              } @else {
                <p class="text-xs text-amber-300" data-locked>
                  Too close to the start to change online. Please call the counter.
                </p>
              }
            }

            @if (changing()?.id === b.id) {
              <div class="space-y-2 border-t border-slate-700 pt-2" data-change-panel>
                <label class="label">New date
                  <input type="date" class="field" [value]="changeDay()" [min]="today" [max]="maxDay()"
                         (change)="changeDay.set($any($event.target).value); loadChange()" data-change-day />
                </label>
                @if (changeLoading()) {
                  <p class="text-xs text-slate-400">Checking free times…</p>
                } @else if (changeSlots().length === 0) {
                  <p class="text-xs text-amber-300">No free times that day.</p>
                } @else {
                  <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    @for (s of changeSlots(); track s.slot_start) {
                      <button type="button" class="btn" [disabled]="busy()" (click)="move(b, s)" data-move>
                        {{ time(s.slot_start) }}
                      </button>
                    }
                  </div>
                }
                <button type="button" class="text-sm text-slate-400 underline" (click)="changing.set(null)">Close</button>
              </div>
            }
          </article>
        }

        <h2 class="pt-2 text-sm font-medium uppercase tracking-wide text-slate-400">Past</h2>
        @if (groups().past.length === 0) { <p class="text-sm text-slate-400">Nothing yet.</p> }
        @for (b of groups().past; track b.id) {
          <article class="rounded border border-slate-800 bg-slate-900/60 p-3 space-y-2" data-past>
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-medium">{{ label(b.station_type) }} · {{ len(b.slots) }}</p>
                <p class="text-sm text-slate-400">{{ long(b.start_at) }}</p>
              </div>
              <span class="rounded bg-slate-800 px-2 py-0.5 text-xs">{{ status(b) }}</span>
            </div>
            @if (billFor(b.id); as bill) {
              <button type="button" class="text-sm text-emerald-300 underline" (click)="toggleBill(bill.bill_no)" data-bill-toggle>
                Bill {{ inr(bill.total) }}
              </button>
              @if (openBill() === bill.bill_no) {
                <div class="rounded bg-slate-950 p-2 text-sm space-y-1" data-bill>
                  @for (i of bill.items; track $index) {
                    <div class="flex justify-between gap-2"><span>{{ i.name }}{{ i.qty > 1 ? ' × ' + i.qty : '' }}</span><span>{{ inr(i.amount) }}</span></div>
                  }
                  @if (bill.discount > 0) {
                    <div class="flex justify-between text-slate-400"><span>Discount</span><span>−{{ inr(bill.discount) }}</span></div>
                  }
                  <div class="flex justify-between font-medium"><span>Total</span><span>{{ inr(bill.total) }}</span></div>
                  @for (p of bill.payments; track $index) {
                    <div class="flex justify-between text-slate-400"><span>Paid by {{ p.mode }}</span><span>{{ inr(p.amount) }}</span></div>
                  }
                  <p class="text-xs text-slate-500">{{ short(bill.created_at) }} · {{ bill.station_name }}</p>
                </div>
              }
            }
          </article>
        }
      }
    </section>
  `,
})
export class MyBookings implements OnInit, OnDestroy {
  private readonly svc = inject(BookingService);

  protected readonly today = todayIst();
  protected readonly info = signal<BookingInfo | null>(null);
  protected readonly bookings = signal<PortalBooking[]>([]);
  protected readonly bills = signal<MyBill[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmCancel = signal<number | null>(null);
  protected readonly changing = signal<PortalBooking | null>(null);
  protected readonly changeDay = signal(todayIst());
  protected readonly changeSlots = signal<FreeSlot[]>([]);
  protected readonly changeLoading = signal(false);
  protected readonly openBill = signal<number | null>(null);
  private readonly now = signal(Date.now());

  protected readonly groups = computed(() => splitBookings(this.bookings(), this.now()));
  protected readonly maxDay = computed(() => addDays(this.today, this.info()?.window_days ?? 7));

  private timer?: ReturnType<typeof setInterval>;

  protected label = typeLabel;
  protected long = formatIstLong;
  protected short = formatIst;
  protected time = formatIstTime;
  protected inr = inr;
  protected len(n: number): string {
    return lengthLabel(n, this.info()?.slot_minutes ?? 30);
  }
  protected status(b: PortalBooking): string {
    return STATUS_LABEL[b.status];
  }
  protected canChange(b: PortalBooking): boolean {
    return canChangeBooking(b, this.now(), this.info()?.cutoff_hours ?? 2);
  }
  protected billFor(bookingId: number): MyBill | undefined {
    return this.bills().find((x) => x.booking_id === bookingId);
  }

  async ngOnInit(): Promise<void> {
    await this.refresh(true);
    // Plain polling: a customer's own list changes rarely, no live connection needed.
    this.timer = setInterval(() => void this.refresh(false), 15_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async refresh(first: boolean): Promise<void> {
    try {
      const [info, bookings, bills] = await Promise.all([this.svc.info(), this.svc.myBookings(), this.svc.myBills()]);
      this.info.set(info);
      this.bookings.set(bookings);
      this.bills.set(bills);
      this.now.set(Date.now());
      this.loaded.set(true);
    } catch (e) {
      if (first) this.error.set((e as Error).message);
    }
  }

  protected toggleBill(no: number): void {
    this.openBill.set(this.openBill() === no ? null : no);
  }

  protected async cancel(b: PortalBooking): Promise<void> {
    await this.act(async () => {
      await this.svc.cancel(b.id);
      this.confirmCancel.set(null);
      this.notice.set('Booking cancelled.');
    });
  }

  protected openChange(b: PortalBooking): void {
    this.changing.set(b);
    this.changeDay.set(b.start_at ? new Date(b.start_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : this.today);
    void this.loadChange();
  }

  protected async loadChange(): Promise<void> {
    const b = this.changing();
    if (!b) return;
    this.changeLoading.set(true);
    try {
      const rows = await this.svc.rescheduleAvailability(b.id, this.changeDay());
      if (this.changing()?.id === b.id) this.changeSlots.set(rows.filter((r) => r.free > 0));
    } catch (e) {
      this.changeSlots.set([]);
      this.error.set((e as Error).message);
    } finally {
      this.changeLoading.set(false);
    }
  }

  protected async move(b: PortalBooking, s: FreeSlot): Promise<void> {
    await this.act(async () => {
      await this.svc.reschedule(b.id, s.slot_start);
      this.changing.set(null);
      this.notice.set(`Moved to ${formatIstLong(s.slot_start)}.`);
    });
    if (this.changing()) void this.loadChange(); // failed (e.g. just taken): show what is still free
  }

  private async act(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await fn();
      await this.refresh(false);
    } catch (e) {
      this.error.set((e as Error).message);
      await this.refresh(false);
    } finally {
      this.busy.set(false);
    }
  }
}
