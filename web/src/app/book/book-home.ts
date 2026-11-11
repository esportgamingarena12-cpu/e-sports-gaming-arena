import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { formatIstTime, todayIst } from '../shared/format';
import { BookingInfo, BookingService, FreeSlot } from './booking.service';
import { lengthLabel, typeLabel } from './portal';

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Public booking page: anyone can see free times; signing in is asked only when they pick one. */
@Component({
  selector: 'app-book-home',
  template: `
    <section class="mx-auto max-w-2xl space-y-4 p-4">
      <h1 class="text-xl font-semibold">Book a slot{{ info()?.shop_name ? ' · ' + info()!.shop_name : '' }}</h1>

      @if (loadError()) {
        <p class="text-sm text-red-400" role="alert">{{ loadError() }}</p>
      } @else if (info(); as i) {
        @if (i.types.length === 0) {
          <p class="text-sm text-slate-400">Online booking is not open yet. Please visit the counter.</p>
        } @else {
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label class="label">Game
              <select class="field" data-type (change)="type.set($any($event.target).value); reload()">
                @for (t of i.types; track t) { <option [value]="t" [selected]="t === type()">{{ label(t) }}</option> }
              </select>
            </label>
            <label class="label">Date
              <input type="date" class="field" data-day [value]="day()" [min]="today" [max]="maxDay()"
                     (change)="day.set($any($event.target).value); reload()" />
            </label>
            <label class="label">Length
              <select class="field" data-slots (change)="slots.set(+$any($event.target).value); reload()">
                @for (n of lengths(); track n) {
                  <option [value]="n" [selected]="n === slots()">{{ len(n) }}</option>
                }
              </select>
            </label>
          </div>
          <p class="text-xs text-slate-400">
            Times are India time. You can cancel or change a booking until {{ i.cutoff_hours }} h before it starts.
          </p>

          @if (loading()) {
            <p class="text-sm text-slate-400">Checking free times…</p>
          } @else if (free().length === 0) {
            <p class="text-sm text-amber-300" data-no-times>No free times for this choice. Try another date or length.</p>
          } @else {
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-slots-grid>
              @for (s of free(); track s.slot_start) {
                <button type="button" class="btn" data-slot [class.ring-2]="picked() === s.slot_start"
                        [class.ring-emerald-400]="picked() === s.slot_start" (click)="pick(s)">
                  {{ time(s.slot_start) }}
                </button>
              }
            </div>
          }

          @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

          @if (picked(); as p) {
            <div class="rounded border border-slate-700 bg-slate-900 p-3 space-y-2" data-confirm>
              <p class="text-sm">
                {{ label(type()) }} · {{ day() }} · {{ time(p) }} · {{ len(slots()) }}
              </p>
              <button type="button" class="btn-primary w-full" [disabled]="busy()" (click)="confirm()" data-book>
                {{ auth.session() ? (busy() ? 'Booking…' : 'Confirm booking') : 'Sign in to book' }}
              </button>
            </div>
          }
        }
      } @else {
        <p class="text-sm text-slate-400">Loading…</p>
      }
    </section>
  `,
})
export class BookHome implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly svc = inject(BookingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly today = todayIst();
  protected readonly info = signal<BookingInfo | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly type = signal('');
  protected readonly day = signal(todayIst());
  protected readonly slots = signal(2);
  protected readonly free = signal<FreeSlot[]>([]);
  protected readonly picked = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly maxDay = computed(() => addDays(this.today, this.info()?.window_days ?? 7));
  protected readonly lengths = computed(() => {
    const i = this.info();
    return i ? Array.from({ length: i.max_slots - i.min_slots + 1 }, (_, k) => i.min_slots + k) : [];
  });

  private seq = 0;

  protected label = typeLabel;
  protected time = formatIstTime;
  protected len(n: number): string {
    return lengthLabel(n, this.info()?.slot_minutes ?? 30);
  }

  async ngOnInit(): Promise<void> {
    try {
      const i = await this.svc.info();
      this.info.set(i);
      const q = this.route.snapshot.queryParamMap;
      const t = q.get('type');
      this.type.set(t && i.types.includes(t) ? t : (i.types[0] ?? ''));
      const d = q.get('day');
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= this.today && d <= this.maxDay()) this.day.set(d);
      const n = Number(q.get('slots'));
      this.slots.set(Number.isInteger(n) && n >= i.min_slots && n <= i.max_slots ? n : Math.min(2, i.max_slots));
      await this.reload();
      const start = Number(q.get('start'));
      if (start) {
        const iso = this.free().find((s) => Date.parse(s.slot_start) === start)?.slot_start;
        if (iso) this.picked.set(iso);
      }
    } catch (e) {
      this.loadError.set((e as Error).message);
    }
  }

  protected async reload(): Promise<void> {
    if (!this.type()) return;
    const my = ++this.seq;
    this.picked.set(null);
    this.error.set(null);
    this.loading.set(true);
    try {
      const rows = await this.svc.availability(this.type(), this.day(), this.slots());
      if (my === this.seq) this.free.set(rows.filter((r) => r.free > 0));
    } catch (e) {
      if (my === this.seq) {
        this.free.set([]);
        this.error.set((e as Error).message);
      }
    } finally {
      if (my === this.seq) this.loading.set(false);
    }
  }

  protected pick(s: FreeSlot): void {
    this.picked.set(s.slot_start);
    this.error.set(null);
  }

  protected async confirm(): Promise<void> {
    const start = this.picked();
    if (!start) return;
    if (!this.auth.session()) {
      await this.router.navigate(['/book/login'], { queryParams: { next: this.resumeUrl(start) } });
      return;
    }
    if (this.auth.role() !== 'customer') {
      this.error.set('Staff accounts book from the counter.');
      return;
    }
    if (!this.auth.customer()) {
      await this.router.navigate(['/book/profile'], { queryParams: { next: this.resumeUrl(start) } });
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.book(this.type(), start, this.slots());
      await this.router.navigateByUrl('/book/my-bookings');
    } catch (e) {
      const msg = (e as Error).message;
      await this.reload(); // the slot may have just gone: show what is still free
      this.error.set(msg);
    } finally {
      this.busy.set(false);
    }
  }

  /** The /book address that restores this choice after sign-in. */
  private resumeUrl(startIso: string): string {
    const p = new URLSearchParams({
      type: this.type(),
      day: this.day(),
      slots: String(this.slots()),
      start: String(Date.parse(startIso)),
    });
    return `/book?${p.toString()}`;
  }
}
