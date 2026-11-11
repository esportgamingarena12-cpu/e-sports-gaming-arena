import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon } from '../shared/icon';
import { LoginStage } from '../shared/login-stage';
import { BookingInfo, BookingService } from './booking.service';
import { loginChips } from './plans';
import { safeNext } from './portal';

@Component({
  selector: 'app-book-login',
  imports: [ReactiveFormsModule, Icon, LoginStage],
  template: `
    <section class="mx-auto my-4 grid max-w-5xl overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-900/70 shadow-[0_0_60px_-20px_rgb(139_92_246_/_0.8)] sm:my-8 md:min-h-[34rem] md:grid-cols-[1.05fr_1fr]">
      <app-login-stage class="h-44 md:h-auto" variant="customer" eyebrow="Players club"
        headline="Your slot is waiting"
        tagline="Pick a station, choose your time and walk in ready to play."
        [chips]="chips()" />

      <div class="flex flex-col justify-center p-5 sm:p-9">
        <span class="eyebrow">{{ sent() ? 'Check your inbox' : 'Welcome' }}</span>
        <h1 class="mt-1 font-display text-3xl font-bold tracking-wide text-slate-50">Login to book</h1>
        @if (!sent()) {
          <p class="mt-1 text-sm text-slate-400">We email you a 6-digit code. No password needed.</p>
          <form [formGroup]="emailForm" (ngSubmit)="sendCode()" class="mt-6 space-y-4">
            <label class="block text-sm font-medium text-slate-300">Email
              <span class="relative mt-1.5 block">
                <app-icon name="mail" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                <input formControlName="email" type="email" autocomplete="email" placeholder="you@example.com"
                       class="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30" />
              </span>
            </label>
            @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }
            <button type="submit" [disabled]="emailForm.invalid || busy()" class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base">
              {{ busy() ? 'Sending…' : 'Email me a code' }}
              @if (!busy()) { <app-icon name="arrow" /> }
            </button>
          </form>
        } @else {
          <p class="mt-1 text-sm text-slate-400">Enter the code sent to {{ emailForm.getRawValue().email }}.</p>
          <form [formGroup]="codeForm" (ngSubmit)="verify()" class="mt-6 space-y-4">
            <label class="block text-sm font-medium text-slate-300">Code
              <span class="relative mt-1.5 block">
                <app-icon name="lock" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                <input formControlName="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"
                       class="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3 text-slate-100 tracking-widest outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30" />
              </span>
            </label>
            @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }
            <button type="submit" [disabled]="codeForm.invalid || busy()" class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base">
              {{ busy() ? 'Checking…' : 'Verify and continue' }}
              @if (!busy()) { <app-icon name="arrow" /> }
            </button>
            <button type="button" class="w-full text-sm text-slate-400 underline hover:text-cyan-300" (click)="sent.set(false)">
              Use a different email
            </button>
          </form>
        }
      </div>
    </section>
  `,
})
export class BookLogin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  private readonly svc = inject(BookingService);
  private readonly info = signal<BookingInfo | null>(null);
  /** Small facts under the banner headline: real station types and the lowest hourly rate. */
  protected readonly chips = computed(() => loginChips(this.info()));

  protected readonly sent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6,8}$/)]],
  });

  constructor() {
    // the banner shows the real rates; if the shop info cannot be loaded it just shows the plain chips
    void this.svc.info().then((i) => this.info.set(i)).catch(() => undefined);
  }

  private readonly route = inject(ActivatedRoute);
  private next(): string | null {
    return safeNext(this.route.snapshot.queryParamMap.get('next'));
  }

  protected async sendCode(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.requestOtp(this.emailForm.getRawValue().email.trim());
      this.sent.set(true);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const p = await this.auth.verifyOtp(
        this.emailForm.getRawValue().email.trim(),
        this.codeForm.getRawValue().code.trim(),
      );
      if (p.role !== 'customer') {
        await this.router.navigateByUrl(this.auth.homeFor(p.role));
      } else if (!this.auth.customer()) {
        // first visit: ask for name and phone, then carry on to where they were going
        await this.router.navigate(['/book/profile'], { queryParams: { next: this.next() ?? '/book' } });
      } else {
        await this.router.navigateByUrl(this.next() ?? '/book/my-bookings');
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
