import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { homeFor } from '../core/models';
import { changePasswordProblem } from '../core/password-login';
import { Icon } from './icon';
import { ToastService } from './toast.service';
import { CAPTCHA_REQUIRED, Turnstile } from './turnstile';

/** Change password: the same screen for admin, staff and customers (they reach it from the account menu, above Logout). */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, RouterLink, Icon, Turnstile],
  template: `
    <section class="mx-auto max-w-md p-4">
      <h1 class="page-title">Change password</h1>
      <p class="mt-1 text-sm text-slate-400" data-who>For {{ auth.profile()?.email }}.</p>

      <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 space-y-3" data-form>
        @if (needsCurrent()) {
          <label class="label">Current password
            <span class="relative block">
              <input formControlName="current" [type]="show() ? 'text' : 'password'" autocomplete="current-password" class="field pr-11" data-current />
            </span>
          </label>
        } @else {
          <p class="rounded bg-cyan-400/10 p-2 text-sm text-cyan-200" data-google-note>
            You signed in with Google, so there is no password yet. Choose one below and you can use it as well.
          </p>
        }
        <label class="label">New password
          <input formControlName="next" [type]="show() ? 'text' : 'password'" autocomplete="new-password" class="field" data-new />
          <span class="mt-1 block text-xs text-slate-400">At least 8 characters, with letters and a number.</span>
        </label>
        <label class="label">Confirm new password
          <input formControlName="confirm" [type]="show() ? 'text' : 'password'" autocomplete="new-password" class="field" data-confirm />
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" [checked]="show()" (change)="show.set(!show())" data-show /> Show passwords
        </label>

        @if (problem()) { <p class="text-sm text-red-400" role="alert" data-error>{{ problem() }}</p> }
        @if (done()) { <p class="rounded bg-emerald-500/15 p-2 text-sm text-emerald-300" role="status" data-done>Your password was changed.</p> }

        @if (needsCurrent()) { <app-turnstile (token)="captcha.set($event)" /> }
        <div class="flex gap-2">
          <button type="submit" class="btn-primary flex-1" [disabled]="busy() || captchaBlocked()" data-save>
            <app-icon name="lock" [size]="16" /> {{ busy() ? 'Saving…' : 'Change password' }}
          </button>
          <a class="btn" [routerLink]="home()">Back</a>
        </div>
      </form>
    </section>
  `,
})
export class ChangePassword {
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly form = this.fb.nonNullable.group({ current: [''], next: [''], confirm: [''] });
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly done = signal(false);

  protected readonly needsCurrent = computed(() => this.auth.hasPassword());
  protected readonly captcha = signal('');
  private readonly turnstile = viewChild(Turnstile);
  protected readonly captchaBlocked = computed(() => CAPTCHA_REQUIRED && this.needsCurrent() && !this.captcha());
  protected readonly home = computed(() => homeFor(this.auth.role() ?? 'customer'));

  protected async save(): Promise<void> {
    this.done.set(false);
    const v = this.form.getRawValue();
    const bad = changePasswordProblem(v.current, v.next, v.confirm, this.auth.profile()?.email ?? '', this.needsCurrent());
    this.problem.set(bad);
    if (bad) return;
    this.busy.set(true);
    try {
      await this.auth.changePassword(v.current, v.next, this.captcha());
      this.form.reset({ current: '', next: '', confirm: '' });
      this.done.set(true);
      this.toast.success('Password changed');
    } catch (e) {
      this.problem.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.turnstile()?.reset(); // a security-check token works once
    }
  }
}
