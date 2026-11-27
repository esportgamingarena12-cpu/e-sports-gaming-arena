import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { afterLoginPath, oauthErrorFrom } from '../core/google-login';
import { passwordProblem, passwordsMatch } from '../core/password-login';
import { watchAutofill } from '../shared/autofill';
import { retryOnce } from '../core/secure-login';
import { Icon } from '../shared/icon';
import { LegalLinks } from '../legal/legal-links';
import { LoginStage } from '../shared/login-stage';
import { tokenFor, Turnstile } from '../shared/turnstile';
import { notBlank } from '../shared/validators';
import { BookingInfo, BookingService } from './booking.service';
import { loginChips } from './plans';
import { safeNext } from './portal';

/** Group rule for the sign-up form: the two passwords must be the same. */
function passwordsAgree(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirm = group.get('confirm')?.value as string;
  return !confirm || passwordsMatch(password, confirm) ? null : { mismatch: true };
}

/** Rule for the new password: the same one the unit tests cover (core/password-login.ts). */
function strongPassword(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string;
  if (!value) return null;
  const problem = passwordProblem(value);
  return problem ? { weak: problem } : null;
}

type Mode = 'signin' | 'signup';

const FIELD =
  'w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30';

@Component({
  selector: 'app-book-login',
  imports: [ReactiveFormsModule, Icon, LoginStage, RouterLink, LegalLinks, Turnstile],
  template: `
    <section class="relative isolate mx-auto my-4 grid max-w-5xl overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-900/70 shadow-[0_0_60px_-20px_rgb(139_92_246_/_0.8)] sm:my-8 md:my-0 md:flex md:min-h-[calc(100vh-4rem)] md:max-w-none md:items-center md:rounded-none md:border-0 md:bg-transparent md:px-[5vw] md:shadow-none" data-login-screen>
      <app-login-stage class="h-44 md:absolute md:inset-0 md:h-auto" variant="customer" eyebrow="Players club"
        headline="Your slot is waiting"
        tagline="Pick a station, choose your time and walk in ready to play."
        [chips]="chips()" />

      <div class="relative z-10 flex flex-col justify-center p-5 sm:p-9 md:my-10 md:ml-auto md:w-[23rem] lg:w-[26rem] xl:w-[28rem] md:max-w-full md:rounded-3xl md:border md:border-white/10 md:bg-[#0d0a24]/70 md:p-7 lg:p-8 xl:p-10 md:shadow-[0_30px_90px_-20px_rgb(0_0_0_/_0.9),0_0_90px_-30px_rgb(139_92_246_/_0.9),inset_0_1px_0_rgb(255_255_255_/_0.08)] md:backdrop-blur-2xl" data-login-panel>
        <span class="pointer-events-none absolute inset-x-10 top-0 hidden h-px bg-linear-to-r from-transparent via-cyan-300 to-transparent md:block" aria-hidden="true"></span>
        <h1 class="font-display text-3xl font-bold tracking-wide text-slate-50">{{ mode() === 'signup' ? 'Create your account' : 'Login to book' }}</h1>

        @if (finishing()) {
          <p class="mt-6 text-sm text-slate-300" role="status" data-finishing>Signing you in…</p>
        } @else {
          @if (error()) { <p class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert" data-error>{{ error() }}</p> }
          @if (info2()) { <p class="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" role="status" data-info>{{ info2() }}</p> }

          <!-- Google: the quickest way in -->
          <button type="button" (click)="google()" [disabled]="busy()" data-google
                  class="mt-5 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-[0_0_28px_-6px_rgb(255_255_255_/_0.55)] transition hover:bg-slate-100 hover:shadow-[0_0_34px_-4px_rgb(255_255_255_/_0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-60">
            <svg viewBox="0 0 48 48" class="size-5 shrink-0" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            {{ busy() ? 'Opening Google…' : 'Continue with Google' }}
          </button>

          <div class="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500" aria-hidden="true">
            <span class="h-px flex-1 bg-slate-700"></span>or with your email<span class="h-px flex-1 bg-slate-700"></span>
          </div>

          <!-- Sign in / Create account -->
          <div class="grid grid-cols-2 rounded-xl bg-slate-950/60 p-1 text-sm font-semibold" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" [attr.aria-selected]="mode() === 'signin'" (click)="setMode('signin')" data-tab-signin
                    class="rounded-lg py-2 transition" [class]="mode() === 'signin' ? 'bg-linear-to-r from-violet-600 to-fuchsia-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'">Sign in</button>
            <button type="button" role="tab" [attr.aria-selected]="mode() === 'signup'" (click)="setMode('signup')" data-tab-signup
                    class="rounded-lg py-2 transition" [class]="mode() === 'signup' ? 'bg-linear-to-r from-violet-600 to-fuchsia-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'">Create account</button>
          </div>

          @if (mode() === 'signin') {
            <form [formGroup]="signinForm" (ngSubmit)="signIn()" class="mt-4 space-y-3.5" data-signin-form>
              <label class="block text-sm font-medium text-slate-300">Email
                <span class="relative mt-1.5 block">
                  <app-icon name="mail" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                  <input formControlName="email" type="email" autocomplete="email" placeholder="you@example.com" class="${FIELD}" data-si-email />
                </span>
              </label>
              <div class="block text-sm font-medium text-slate-300">
                <label for="si-password">Password</label>
                <span class="relative mt-1.5 block">
                  <app-icon name="lock" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                  <input id="si-password" formControlName="password" [type]="show() ? 'text' : 'password'" autocomplete="current-password" placeholder="Your password" class="${FIELD} !pr-11" data-si-password />
                  <button type="button" (click)="show.set(!show())" data-toggle-password aria-label="Show typed characters"
                          class="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-cyan-300">
                    <app-icon [name]="show() ? 'eyeoff' : 'eye'" />
                  </button>
                </span>
              </div>
              <label class="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" formControlName="remember" class="size-4 accent-violet-500" data-remember /> Remember me
              </label>
              <button type="submit" [disabled]="signinForm.invalid || busy()" class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base" data-signin-submit>
                @if (busy()) { <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" role="status" aria-label="Please wait" data-spinner></span> }
                {{ busy() ? (waiting() ? 'Checking security…' : 'Signing in…') : 'Sign in' }}
                @if (!busy()) { <app-icon name="arrow" /> }
              </button>
              <p class="text-center text-xs text-slate-500">Forgot your password? Sign in with Google instead.</p>
            </form>
          } @else {
            <form [formGroup]="signupForm" (ngSubmit)="signUp()" class="mt-4 space-y-3.5" data-signup-form>
              <label class="block text-sm font-medium text-slate-300">Full name
                <span class="relative mt-1.5 block">
                  <app-icon name="user" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                  <input formControlName="name" autocomplete="name" placeholder="Your full name" class="${FIELD}" data-su-name />
                </span>
              </label>
              <label class="block text-sm font-medium text-slate-300">Email
                <span class="relative mt-1.5 block">
                  <app-icon name="mail" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                  <input formControlName="email" type="email" autocomplete="email" placeholder="you@example.com" class="${FIELD}" data-su-email />
                </span>
              </label>
              <div class="block text-sm font-medium text-slate-300">
                <label for="su-password">Password</label>
                <span class="relative mt-1.5 block">
                  <app-icon name="lock" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                  <input id="su-password" formControlName="password" [type]="show() ? 'text' : 'password'" autocomplete="new-password" placeholder="At least 8 characters" class="${FIELD} !pr-11" data-su-password />
                  <button type="button" (click)="show.set(!show())" data-toggle-password-su aria-label="Show typed characters"
                          class="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-cyan-300">
                    <app-icon [name]="show() ? 'eyeoff' : 'eye'" />
                  </button>
                </span>
                @if (signupForm.controls.password.touched && signupForm.controls.password.errors?.['weak']; as weak) {
                  <span class="mt-1 block text-xs font-normal text-red-400" role="alert" data-su-weak>{{ weak }}</span>
                } @else {
                  <span class="mt-1 block text-xs font-normal text-slate-500">Letters and at least one number.</span>
                }
              </div>
              <div class="block text-sm font-medium text-slate-300">
                <label for="su-confirm">Confirm password</label>
                <span class="relative mt-1.5 block">
                  <app-icon name="lock" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                  <input id="su-confirm" formControlName="confirm" [type]="show() ? 'text' : 'password'" autocomplete="new-password" placeholder="Type it again" class="${FIELD}" data-su-confirm />
                </span>
                @if (signupForm.hasError('mismatch') && signupForm.controls.confirm.dirty) {
                  <span class="mt-1 block text-xs font-normal text-red-400" role="alert" data-su-mismatch>The two passwords are not the same</span>
                }
              </div>
              <label class="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" formControlName="remember" class="size-4 accent-violet-500" data-su-remember /> Remember me
              </label>
              <label class="flex items-start gap-2 text-sm text-slate-300">
                <input type="checkbox" formControlName="agree" class="mt-0.5 size-4 shrink-0 accent-violet-500" data-su-agree />
                <span>I have read the <a routerLink="/terms" target="_blank" rel="noopener" class="text-cyan-300 underline">Terms</a> and the
                  <a routerLink="/privacy" target="_blank" rel="noopener" class="text-cyan-300 underline">Privacy Policy</a> and I agree.
                  I am 18 or older, or my parent or guardian agrees.</span>
              </label>
              <button type="submit" [disabled]="signupForm.invalid || busy()" class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base" data-signup-submit>
                @if (busy()) { <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" role="status" aria-label="Please wait" data-spinner></span> }
                {{ busy() ? (waiting() ? 'Checking security…' : 'Creating your account…') : 'Create account' }}
                @if (!busy()) { <app-icon name="arrow" /> }
              </button>
            </form>
          }
          <app-turnstile class="mt-3 block" (token)="captcha.set($event)" />
          <div class="mt-4"><app-legal-links [newTab]="true" /></div>

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

  /** Google is the quickest way in; then email and password. */
  protected readonly mode = signal<Mode>('signin');
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  /** true while a customer who just came back from Google is being signed in and sent on */
  protected readonly finishing = signal(false);
  protected readonly error = signal<string | null>(null);
  /** a friendly note, e.g. "check your email to confirm" */
  protected readonly info2 = signal<string | null>(null);

  protected readonly signinForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    remember: [true],
  });
  protected readonly signupForm = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, notBlank]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, strongPassword]],
      confirm: ['', [Validators.required]],
      remember: [true],
      agree: [false, [Validators.requiredTrue]],
    },
    { validators: passwordsAgree },
  );
  /** reads a saved password the browser filled in without telling the page */
  private readonly syncBoxes = watchAutofill([
    { form: this.signinForm, rootOf: (h) => h.querySelector('[data-signin-form]') },
    { form: this.signupForm, rootOf: (h) => h.querySelector('[data-signup-form]') },
  ]);

  constructor() {
    this.auth.warmUpLogin();
    // the banner shows the real rates; if the shop info cannot be loaded it just shows the plain chips
    void this.svc.info().then((i) => this.info.set(i)).catch(() => undefined);
  }

  private next(): string | null {
    return safeNext(this.route.snapshot.queryParamMap.get('next'));
  }

  protected setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set(null);
    this.info2.set(null);
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
      this.error.set(this.auth.notice() ?? 'Google sign-in did not finish. Please try again, or sign in with your email and password.');
    }
  }

  private async go(role: 'admin' | 'staff' | 'customer', next: string | null): Promise<void> {
    await this.auth.refreshCustomer();
    const to = afterLoginPath({ role, hasCustomer: !!this.auth.customer() && !this.auth.needsConsent() }, next, this.auth.homeFor);
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

  /** the Cloudflare security-check token for the next try ('' until it is ready) */
  protected readonly captcha = signal('');
  /** true while a sign-in or sign-up that was started early waits for the security check */
  protected readonly waiting = signal(false);
  private readonly turnstile = viewChild(Turnstile);

  protected async signIn(): Promise<void> {
    this.syncBoxes();
    if (this.signinForm.invalid) {
      this.signinForm.markAllAsTouched();
      return;
    }
    const v = this.signinForm.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      const p = await retryOnce(
        async () => this.auth.signInCustomer(v.email.trim(), v.password, v.remember, await tokenFor(() => this.captcha(), this.waiting)),
        async () => {
          this.error.set('The connection is slow. Trying again…');
          this.turnstile()?.reset(); // the first security check was used up: ask for a new one
          await new Promise((r) => setTimeout(r, 800));
        },
      );
      await this.go(p.role, this.next());
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.turnstile()?.reset(); // a security-check token works once
    }
  }

  protected async signUp(): Promise<void> {
    this.syncBoxes();
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }
    const v = this.signupForm.getRawValue();
    const email = v.email.trim();
    const problem = passwordProblem(v.password, email);
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.info2.set(null);
    try {
      const p = await this.auth.signUpCustomer(v.name.trim(), email, v.password, v.remember, await tokenFor(() => this.captcha(), this.waiting));
      if (p) {
        // remember that they agreed; if this fails they are simply asked again on the next screen
        await this.auth.recordConsent().catch(() => undefined);
        await this.go(p.role, this.next());
      } else {
        // the project asks for the email to be confirmed first: no session yet
        this.info2.set(`We sent a message to ${email}. Open it to confirm your email, then sign in here.`);
        this.signinForm.patchValue({ email });
        this.mode.set('signin');
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.turnstile()?.reset();
    }
  }
}
