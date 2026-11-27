import { Component, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { watchAutofill } from './autofill';
import { retryOnce } from '../core/secure-login';
import { Icon } from './icon';
import { LoginStage } from './login-stage';
import { tokenFor, Turnstile } from './turnstile';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Icon, LoginStage, Turnstile],
  template: `
    <section class="relative isolate mx-auto my-4 grid max-w-5xl overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-900/70 shadow-[0_0_60px_-20px_rgb(139_92_246_/_0.8)] sm:my-8 md:my-0 md:flex md:min-h-[calc(100vh-4rem)] md:max-w-none md:items-center md:rounded-none md:border-0 md:bg-transparent md:px-[5vw] md:shadow-none" data-login-screen>
      <app-login-stage class="h-44 md:absolute md:inset-0 md:h-auto" variant="staff" eyebrow="Staff area"
        headline="Run the arena like a pro"
        tagline="Stations, billing, canteen and reports, all in one place."
        [chips]="['Live stations', 'Fast billing', 'Reports']" />

      <div class="relative z-10 flex flex-col justify-center p-5 sm:p-9 md:my-10 md:ml-auto md:w-[23rem] lg:w-[26rem] xl:w-[28rem] md:max-w-full md:rounded-3xl md:border md:border-white/10 md:bg-[#0d0a24]/70 md:p-7 lg:p-8 xl:p-10 md:shadow-[0_30px_90px_-20px_rgb(0_0_0_/_0.9),0_0_90px_-30px_rgb(139_92_246_/_0.9),inset_0_1px_0_rgb(255_255_255_/_0.08)] md:backdrop-blur-2xl" data-login-panel>
        <span class="pointer-events-none absolute inset-x-10 top-0 hidden h-px bg-linear-to-r from-transparent via-cyan-300 to-transparent md:block" aria-hidden="true"></span>
        <h1 class="font-display text-3xl font-bold tracking-wide text-slate-50">Staff login</h1>
        <p class="mt-1 text-sm text-slate-400">Admin and counter staff.</p>

        @if (auth.notice(); as n) {
          <p class="mt-3 rounded bg-amber-500/15 p-2 text-sm text-amber-300" role="alert">{{ n }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4">
          <label class="block text-sm font-medium text-slate-300">Email
            <span class="relative mt-1.5 block">
              <app-icon name="mail" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
              <input formControlName="email" type="email" autocomplete="username" placeholder="you@example.com"
                     class="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30" />
            </span>
          </label>
          <div class="block text-sm font-medium text-slate-300"><label for="staff-password">Password</label>
            <span class="relative mt-1.5 block">
              <app-icon name="lock" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
              <input id="staff-password" formControlName="password" [type]="show() ? 'text' : 'password'" autocomplete="current-password" placeholder="Your password"
                     class="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-11 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30" />
              <button type="button" (click)="show.set(!show())" data-toggle-password
                      class="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-cyan-300"
                      [attr.aria-label]="show() ? 'Hide typed characters' : 'Show typed characters'">
                <app-icon [name]="show() ? 'eyeoff' : 'eye'" />
              </button>
            </span>
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" formControlName="remember" class="size-4 accent-violet-500" data-remember /> Remember me on this computer
          </label>
          @if (error()) {
            <p class="text-sm text-red-400" role="alert">{{ error() }}</p>
          }
          <app-turnstile (token)="captcha.set($event)" />
          <button type="submit" [disabled]="form.invalid || busy()" class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base">
            @if (busy()) { <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" role="status" aria-label="Please wait" data-spinner></span> }
            {{ busy() ? (waiting() ? 'Checking security…' : 'Signing in…') : 'Sign in' }}
            @if (!busy()) { <app-icon name="arrow" /> }
          </button>
        </form>
      </div>
    </section>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly captcha = signal('');
  /** true while a sign-in that was started early waits for the security check */
  protected readonly waiting = signal(false);
  private readonly turnstile = viewChild(Turnstile);
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    remember: [true],
  });

  /** reads a saved password the browser filled in without telling the page */
  private readonly syncBoxes = watchAutofill([{ form: this.form }]);

  constructor() {
    this.auth.warmUpLogin();
    // already signed in when the page opens -> go to your own area.
    // (While signing in, submit() does the redirect, so this must not fire a second one.)
    effect(() => {
      if (this.auth.profile() && !this.busy()) void this.router.navigateByUrl(this.auth.home());
    });
  }

  protected async submit(): Promise<void> {
    this.syncBoxes();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password, remember } = this.form.getRawValue();
      const p = await retryOnce(
        async () => this.auth.signInWithPassword(email.trim(), password, await tokenFor(() => this.captcha(), this.waiting), remember),
        async () => {
          this.error.set('The connection is slow. Trying again…');
          this.turnstile()?.reset(); // the first security check was used up: ask for a new one
          await new Promise((r) => setTimeout(r, 800));
        },
      );
      await this.router.navigateByUrl(this.auth.homeFor(p.role));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.turnstile()?.reset(); // a security-check token works once
    }
  }
}
