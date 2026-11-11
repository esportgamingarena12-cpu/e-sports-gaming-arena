import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <section class="mx-auto max-w-sm p-4">
      <h1 class="text-xl font-semibold">Staff login</h1>
      <p class="mt-1 text-sm text-slate-400">Admin and counter staff.</p>

      @if (auth.notice(); as n) {
        <p class="mt-3 rounded bg-amber-500/15 p-2 text-sm text-amber-300" role="alert">{{ n }}</p>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-4 space-y-3">
        <label class="block text-sm">Email
          <input formControlName="email" type="email" autocomplete="username"
                 class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2" />
        </label>
        <label class="block text-sm">Password
          <input formControlName="password" type="password" autocomplete="current-password"
                 class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2" />
        </label>
        @if (error()) {
          <p class="text-sm text-red-400" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="form.invalid || busy()"
                class="btn-primary w-full">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </section>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

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
