import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { formatIstTime, todayIst } from '../shared/format';
import { Icon } from '../shared/icon';
import { BookingInfo, BookingService, FreeSlot } from './booking.service';
import { lengthLabel, typeLabel } from './portal';

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Public booking page: anyone can see free times; signing in is asked only when they pick one. */
@Component({
  selector: 'app-book-home',
  imports: [Icon],
  template: `
    <!-- Hero -->
    <section class="relative overflow-hidden px-4 pb-8 pt-8 sm:pt-12">
      <div class="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p class="eyebrow">Welcome to</p>
          <h1 class="mt-2 font-display text-5xl font-bold leading-[0.95] tracking-wide sm:text-6xl">
            E-SPORT<br /><span class="glow-text">GAMING ARENA</span>
          </h1>
          <p class="mt-4 font-display text-lg font-semibold tracking-wide text-slate-100">
            Play <span class="text-violet-400">|</span> Compete <span class="text-violet-400">|</span> Stream
            <span class="text-violet-400">|</span> Repeat
          </p>
          <p class="mt-3 max-w-md text-sm text-slate-300">
            High-performance PCs and consoles, billed fairly by the minute. See what is free and book your slot in under a minute.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a href="#book" class="btn-primary inline-flex items-center gap-2" data-hero-book>Book a Gaming Slot <app-icon name="play" [size]="16" /></a>
            @if ((info()?.rates?.length ?? 0) > 0) {
              <a href="#rates" class="btn-outline inline-flex items-center">View rates</a>
            }
          </div>
        </div>
        <div class="relative mx-auto hidden aspect-square w-full max-w-sm place-items-center md:grid" aria-hidden="true">
          <div class="absolute inset-6 rounded-full bg-violet-600/30 blur-3xl"></div>
          <div class="absolute inset-16 rounded-full bg-cyan-400/20 blur-3xl"></div>
          <div class="relative grid size-56 place-items-center rounded-[2.5rem] border border-violet-400/40 bg-slate-900/70 text-violet-300
                      shadow-[0_0_60px_-10px_rgb(139_92_246_/_0.9)]">
            <app-icon name="gamepad" [size]="150" />
          </div>
        </div>
      </div>

      <div class="mx-auto mt-8 grid max-w-6xl grid-cols-2 gap-3 md:grid-cols-4" data-features>
        @for (f of features(); track f.title) {
          <div class="card flex flex-col items-center gap-2 py-4 text-center">
            <span class="text-cyan-300"><app-icon [name]="f.icon" [size]="30" /></span>
            <p class="text-sm font-semibold text-slate-100">{{ f.title }}</p>
            <p class="text-xs text-slate-400">{{ f.text }}</p>
          </div>
        }
      </div>
    </section>

    <!-- Booking -->
    <section id="book" class="mx-auto max-w-3xl scroll-mt-20 px-4 pb-10">
      <h2 class="page-title">Book a slot{{ info()?.shop_name ? ' · ' + info()!.shop_name : '' }}</h2>

      @if (loadError()) {
        <p class="mt-3 text-sm text-red-400" role="alert">{{ loadError() }}</p>
      } @else if (info(); as i) {
        @if (i.types.length === 0) {
          <p class="mt-3 text-sm text-slate-400">Online booking is not open yet. Please visit the counter.</p>
        } @else {
          <div class="card mt-3 space-y-4 sm:p-5">
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
                  <button type="button" class="btn !py-2.5 font-medium" data-slot
                          [class]="picked() === s.slot_start ? '!border-orange-500 !bg-orange-500 !text-slate-950' : ''"
                          (click)="pick(s)">
                    {{ time(s.slot_start) }}
                  </button>
                }
              </div>
            }

            @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

            @if (picked(); as p) {
              <div class="space-y-3 rounded-xl border border-orange-500/40 bg-slate-950/60 p-3" data-confirm>
                <p class="text-sm">
                  <span class="font-semibold text-orange-400">{{ label(type()) }}</span> · {{ day() }} · {{ time(p) }} · {{ len(slots()) }}
                </p>
                <button type="button" class="btn-primary w-full" [disabled]="busy()" (click)="confirm()" data-book>
                  {{ auth.session() ? (busy() ? 'Booking…' : 'Confirm booking') : 'Sign in to book' }}
                </button>
              </div>
            }
          </div>
        }
      } @else {
        <p class="mt-3 text-sm text-slate-400">Loading…</p>
      }
    </section>

    <!-- Rates (the real hourly rates from the shop settings) -->
    @if ((info()?.rates?.length ?? 0) > 0) {
      <section id="rates" class="mx-auto max-w-6xl scroll-mt-20 px-4 pb-12">
        <h2 class="page-title text-center">Our rates</h2>
        <p class="mt-1 text-center text-sm text-slate-400">Billed by the minute on the clock, rounded up to a fair block.</p>
        <div class="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-2" data-rates>
          @for (r of info()!.rates; track r.type) {
            <div class="card flex items-center justify-between gap-3 p-4">
              <div>
                <p class="flex items-center gap-2 font-display text-xl font-bold"><span class="text-violet-400"><app-icon [name]="r.type === 'pc' ? 'monitor' : 'gamepad'" /></span>{{ label(r.type) }}</p>
                <p class="mt-1 text-sm text-slate-300"><span class="font-display text-2xl font-bold text-slate-50">₹{{ r.rate_per_hour }}</span> / hour</p>
              </div>
              <button type="button" class="btn-outline" (click)="chooseType(r.type)" data-choose>Book {{ label(r.type) }}</button>
            </div>
          }
        </div>
      </section>
    }
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

  protected readonly features = computed(() => [
    { icon: 'monitor', title: 'High-End PCs & Consoles', text: 'Smooth, fast, ready to play' },
    { icon: 'wifi', title: 'Ultra-Fast Network', text: 'Low ping, no lag' },
    { icon: 'calendar', title: 'Instant Booking', text: 'See free times live' },
    { icon: 'check', title: 'Easy Changes', text: `Cancel or move until ${this.info()?.cutoff_hours ?? 2} h before` },
  ]);

  protected chooseType(t: string): void {
    this.type.set(t);
    void this.reload();
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
