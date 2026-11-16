import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { afterLoginPath, oauthErrorFrom } from '../core/google-login';
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

        @if (finishing()) {
          <p class="mt-6 text-sm text-slate-300" role="status" data-finishing>Signing you in…</p>
        } @else if (!showCode() && !sent()) {
          <!-- Google sign-in: no code to type -->
          <p class="mt-1 text-sm text-slate-400">Sign in with your Google account. No password and no code to type.</p>
          @if (error()) { <p class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert" data-error>{{ error() }}</p> }
          <button type="button" (click)="google()" [disabled]="busy()" data-google
                  class="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-[0_0_28px_-6px_rgb(255_255_255_/_0.55)] transition hover:bg-slate-100 hover:shadow-[0_0_34px_-4px_rgb(255_255_255_/_0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-60">
            <svg viewBox="0 0 48 48" class="size-5 shrink-0" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            {{ busy() ? 'Opening Google…' : 'Continue with Google' }}
          </button>
          <p class="mt-3 text-center text-xs text-slate-500">We only get your name and email from Google.</p>
          <p class="mt-6 text-center text-sm">
            <button type="button" class="text-slate-400 underline hover:text-cyan-300" (click)="showCode.set(true)" data-use-code>Use an email code instead</button>
          </p>
        } @else if (!sent()) {
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
            <button type="button" class="w-full text-sm text-slate-400 underline hover:text-cyan-300" (click)="showCode.set(false)" data-use-google>
              Sign in with Google instead
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
export class BookLogin implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly svc = inject(BookingService);
  private readonly route = inject(ActivatedRoute);

  private readonly info = signal<BookingInfo | null>(null);
  /** Small facts under the banner headline: real station types and the lowest hourly rate. */
  protected readonly chips = computed(() => loginChips(this.info()));

  /** Google is the main way in; the email code is the backup. */
  protected readonly showCode = signal(false);
  protected readonly sent = signal(false);
  protected readonly busy = signal(false);
  /** true while a customer who just came back from Google is being signed in and sent on */
  protected readonly finishing = signal(false);
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

  private next(): string | null {
    return safeNext(this.route.snapshot.queryParamMap.get('next'));
  }

  async ngOnInit(): Promise<void> {
    // Coming back from Google: finish the sign-in and send the customer on. A cancelled or failed return shows a message.
    const returned = oauthErrorFrom({ hash: window.location.hash, search: window.location.search });
    await this.auth.whenReady();
    const pending = this.auth.takeGoogleReturn();
    if (returned) {
      this.error.set(returned);
      return;
    }
    const profile = this.auth.profile();
    if (pending && this.auth.session() && profile) {
      this.finishing.set(true);
      await this.auth.refreshCustomer();
      await this.go(profile.role, safeNext(pending.next));
    } else if (pending) {
      this.error.set(this.auth.notice() ?? 'Google sign-in did not finish. Please try again, or use an email code instead.');
    }
  }

  private async go(role: 'admin' | 'staff' | 'customer', next: string | null): Promise<void> {
    const to = afterLoginPath({ role, hasCustomer: !!this.auth.customer() }, next, this.auth.homeFor);
    if (to.kind === 'profile') await this.router.navigate(['/book/profile'], { queryParams: { next: to.next } });
    else await this.router.navigateByUrl(to.url);
  }

  protected async google(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.signInWithGoogle(this.next());
    } catch (e) {
      this.error.set((e as Error).message);
      this.busy.set(false);
    }
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
      const p = await this.auth.verifyOtp(this.emailForm.getRawValue().email.trim(), this.codeForm.getRawValue().code.trim());
      await this.go(p.role, this.next());
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
