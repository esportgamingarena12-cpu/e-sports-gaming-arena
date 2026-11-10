import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-book-login',
  imports: [ReactiveFormsModule],
  template: `
    <section class="mx-auto max-w-sm p-4">
      <h1 class="text-xl font-semibold">Login to book</h1>
      @if (!sent()) {
        <p class="mt-1 text-sm text-slate-400">We email you a 6-digit code. No password needed.</p>
        <form [formGroup]="emailForm" (ngSubmit)="sendCode()" class="mt-4 space-y-3">
          <label class="block text-sm">Email
            <input formControlName="email" type="email" autocomplete="email"
                   class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2" />
          </label>
          @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }
          <button type="submit" [disabled]="emailForm.invalid || busy()"
                  class="w-full rounded bg-emerald-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-50">
            {{ busy() ? 'Sending…' : 'Email me a code' }}
          </button>
        </form>
      } @else {
        <p class="mt-1 text-sm text-slate-400">Enter the code sent to {{ emailForm.getRawValue().email }}.</p>
        <form [formGroup]="codeForm" (ngSubmit)="verify()" class="mt-4 space-y-3">
          <label class="block text-sm">Code
            <input formControlName="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8"
                   class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 tracking-widest" />
          </label>
          @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }
          <button type="submit" [disabled]="codeForm.invalid || busy()"
                  class="w-full rounded bg-emerald-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-50">
            {{ busy() ? 'Checking…' : 'Verify and continue' }}
          </button>
          <button type="button" class="w-full text-sm text-slate-400 underline" (click)="sent.set(false)">
            Use a different email
          </button>
        </form>
      }
    </section>
  `,
})
export class BookLogin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly sent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6,8}$/)]],
  });

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
      await this.router.navigateByUrl(p.role === 'customer' ? '/book/my-bookings' : this.auth.homeFor(p.role));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
