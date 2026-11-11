import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { formatIstTime, todayIst } from '../shared/format';
import { RouterLink } from '@angular/router';
import { ControllerArt, HeroArt, RoomArt } from '../shared/art';
import { Icon } from '../shared/icon';
import { BookingInfo, BookingService, FreeSlot } from './booking.service';
import { lengthLabel, typeLabel } from './portal';
import { buildPlans } from './plans';

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Public booking page: anyone can see free times; signing in is asked only when they pick one. */
@Component({
  selector: 'app-book-home',
  imports: [Icon, HeroArt, RoomArt, ControllerArt, RouterLink],
  template: `
    <!-- Hero -->
    <section class="relative px-4 pb-10 pt-8 sm:pt-12">
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div class="absolute -left-32 -top-10 h-[130%] w-80 -skew-x-12 bg-linear-to-b from-fuchsia-600/45 via-violet-700/20 to-transparent blur-2xl"></div>
        <div class="absolute right-0 top-0 h-full w-2/3 bg-radial from-violet-700/30 to-transparent"></div>
      </div>
      <div class="relative mx-auto grid max-w-7xl items-center gap-4 md:grid-cols-[1fr_1.25fr]">
        <div>
          <p class="eyebrow">Welcome to</p>
          <h1 class="mt-2 font-display text-5xl font-bold italic leading-[0.95] tracking-wide sm:text-6xl lg:text-7xl">
            E-SPORT<br /><span class="glow-text">GAMING ARENA</span>
          </h1>
          <p class="mt-4 font-display text-lg font-semibold tracking-wide text-slate-100">
            Play <span class="text-violet-400">|</span> Compete <span class="text-violet-400">|</span> Stream
            <span class="text-violet-400">|</span> Repeat
          </p>
          <p class="mt-3 max-w-md text-sm text-slate-300">
            A premium gaming studio with high-performance PCs and consoles, billed fairly by the minute. See what is free and book your slot in under a minute.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a href="#book" class="btn-primary inline-flex items-center gap-2" data-hero-book>Book a Gaming Slot <app-icon name="play" [size]="16" /></a>
            <a href="#plans" class="btn-outline inline-flex items-center" data-view-plans>View Plans</a>
          </div>
        </div>
        <div class="mx-auto w-full max-w-md animate-float md:max-w-none"><app-hero-art /></div>
      </div>

      <div class="relative z-10 mx-auto -mb-16 mt-2 grid max-w-7xl grid-cols-2 divide-slate-700/60 rounded-xl border border-violet-500/30 bg-slate-900/85 shadow-[0_0_40px_-12px_rgb(139_92_246_/_0.8)] backdrop-blur md:-mt-4 md:grid-cols-4 md:divide-x" data-features>
        @for (f of features(); track f.title) {
          <div class="flex flex-col items-center gap-2 px-3 py-4 text-center">
            <span class="text-violet-300 drop-shadow-[0_0_8px_rgb(34_211_238_/_0.7)]"><app-icon [name]="f.icon" [size]="32" /></span>
            <p class="text-sm font-semibold text-slate-100">{{ f.title }}</p>
            <p class="text-xs text-slate-400">{{ f.text }}</p>
          </div>
        }
      </div>
    </section>

    <!-- The studio -->
    <section id="studio" class="mx-auto max-w-7xl scroll-mt-20 px-4 pb-8 pt-24">
      <div class="grid items-center gap-6 md:grid-cols-2">
        <div class="overflow-hidden rounded-xl border border-violet-400/50 shadow-[0_0_50px_-10px_rgb(168_85_247_/_0.9)]"><app-room-art /></div>
        <div>
          <h2 class="font-display text-3xl font-bold leading-tight sm:text-4xl">The Ultimate <span class="glow-text">Gaming</span> Studio in Your City</h2>
          <p class="mt-3 text-sm text-slate-300">
            Whether you are a casual gamer or a competitive player, E-Sport Gaming Arena gives you the right setup, comfort and honest pricing to level up your game.
          </p>
          <ul class="mt-4 space-y-2 text-sm" data-checks>
            @for (c of checks; track c) {
              <li class="flex items-center gap-2"><span class="text-cyan-300"><app-icon name="check" [size]="18" /></span>{{ c }}</li>
            }
          </ul>
        </div>
      </div>
    </section>

    <!-- Plans (the real hourly rates and the passes that are for sale) -->
    @if (plans().length > 0) {
      <section id="plans" class="mx-auto max-w-7xl scroll-mt-20 px-4 py-8">
        <h2 class="page-title text-center">Choose Your Plan</h2>
        <p class="mt-1 text-center text-sm text-slate-400">Flexible gaming plans for every kind of player.</p>
        <div class="mt-6 flex flex-wrap justify-center gap-3" data-plans>
          @for (p of plans(); track p.key) {
            <div class="card relative flex w-full flex-col gap-3 p-4 sm:w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]" [class]="p.popular ? '!border-orange-500/70 shadow-[0_0_34px_-10px_rgb(255_107_53_/_0.7)]' : ''" [attr.data-plan]="p.title">
              @if (p.popular) {
                <span class="badge absolute -top-3 left-1/2 -translate-x-1/2 bg-linear-to-r from-violet-600 to-fuchsia-500 px-3 text-white" data-popular>Most popular</span>
              }
              <div class="text-center">
                <span class="mx-auto grid size-12 place-items-center rounded-xl bg-linear-to-br from-violet-500/30 to-cyan-400/20 text-violet-200"><app-icon [name]="p.icon" [size]="28" /></span>
                <p class="mt-1 font-display text-lg font-bold">{{ p.title }}</p>
                <p><span class="font-display text-3xl font-bold">₹{{ p.price }}</span> <span class="text-sm text-slate-400">/ {{ p.per }}</span></p>
              </div>
              <ul class="flex-1 space-y-1.5 text-sm text-slate-300">
                @for (l of p.lines; track l) {
                  <li class="flex items-start gap-2"><span class="mt-0.5 text-cyan-300"><app-icon name="check" [size]="16" /></span>{{ l }}</li>
                }
              </ul>
              <button type="button" class="flex w-full items-center justify-center gap-1.5" [class]="p.popular ? 'btn-primary' : 'btn-outline'" (click)="chooseType(p.type)" data-choose>
                Book Now @if (p.popular) { <app-icon name="arrow" [size]="16" /> }
              </button>
            </div>
          }
        </div>
        <p class="mt-3 text-center text-xs text-slate-400">Passes are bought at the counter and used when you start a session.</p>
      </section>
    }

    <!-- Booking -->
    <section id="book" class="mx-auto max-w-3xl scroll-mt-20 px-4 pb-10 pt-8">
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
                          [class]="picked() === s.slot_start ? '!border-violet-400 !bg-linear-to-r !from-violet-600 !to-fuchsia-500 !text-white' : ''"
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

    <!-- Closing band -->
    <section class="px-4 pb-12">
      <div class="mx-auto flex max-w-7xl flex-col items-start gap-4 overflow-hidden rounded-2xl border border-violet-500/40 bg-linear-to-r from-violet-800/50 via-slate-900 to-slate-900 p-5 shadow-[0_0_40px_-14px_rgb(168_85_247_/_0.9)] sm:flex-row sm:items-center sm:p-6">
        <div class="w-32 shrink-0 sm:w-44"><app-controller-art /></div>
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-2xl font-bold sm:text-3xl">Ready for your next session?</h2>
          <p class="mt-1 text-sm text-slate-300">Pick a time, bring your friends, and walk in. We keep your station ready.</p>
        </div>
        <a href="#book" class="btn-primary inline-flex shrink-0 items-center gap-2" data-band-book>Book Now <app-icon name="arrow" [size]="16" /></a>
      </div>
      <p class="mt-6 text-center text-xs text-slate-500">© E-Sports Gaming Arena · <a routerLink="/login" class="underline hover:text-slate-300" data-staff-link>Staff login</a></p>
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

  protected readonly features = computed(() => [
    { icon: 'monitor', title: 'High-End PCs & Consoles', text: 'Smooth, fast, ready to play' },
    { icon: 'wifi', title: 'Ultra-Fast Network', text: 'Low ping, no lag' },
    { icon: 'calendar', title: 'Instant Booking', text: 'See free times live' },
    { icon: 'check', title: 'Easy Changes', text: `Cancel or move until ${this.info()?.cutoff_hours ?? 2} h before` },
  ]);

  protected readonly checks = [
    'Performance gaming PCs',
    'Console and multiplayer zone',
    'Comfortable gaming lounge',
    'Fair billing by the minute, pay at the counter',
  ];

  /** Hourly rate cards plus the passes that are for sale (real data from the shop settings). */
  protected readonly plans = computed(() => buildPlans(this.info()));

  protected chooseType(t: string | null): void {
    if (!t) {
      document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
