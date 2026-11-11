import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon } from './icon';
import { LoginStage } from './login-stage';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Icon, LoginStage],
  template: `
    <section class="mx-auto my-4 grid max-w-5xl overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-900/70 shadow-[0_0_60px_-20px_rgb(139_92_246_/_0.8)] sm:my-8 md:min-h-[34rem] md:grid-cols-[1.05fr_1fr]">
      <app-login-stage class="h-44 md:h-auto" variant="staff" eyebrow="Staff area"
        headline="Run the arena like a pro"
        tagline="Stations, billing, canteen and reports, all in one place."
        [chips]="['Live stations', 'Fast billing', 'Reports']" />

      <div class="flex flex-col justify-center p-5 sm:p-9">
        <span class="eyebrow">Welcome back</span>
        <h1 class="mt-1 font-display text-3xl font-bold tracking-wide text-slate-50">Staff login</h1>
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
          @if (error()) {
            <p class="text-sm text-red-400" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="form.invalid || busy()" class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base">
            {{ busy() ? 'Signing in…' : 'Sign in' }}
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

  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    // already signed in when the page opens -> go to your own area.
    // (While signing in, submit() does the redirect, so this must not fire a second one.)
    effect(() => {
      if (this.auth.profile() && !this.busy()) void this.router.navigateByUrl(this.auth.home());
    });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const p = await this.auth.signInWithPassword(email.trim(), password);
      await this.router.navigateByUrl(this.auth.homeFor(p.role));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
