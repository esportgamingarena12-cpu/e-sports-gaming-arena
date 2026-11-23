import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { FieldError } from '../shared/field-error';
import { LegalLinks } from '../legal/legal-links';
import { notBlank, phone } from '../shared/validators';
import { BookingService } from './booking.service';
import { safeNext } from './portal';

/** Name and phone, asked before a customer's first booking, and the agreement to the Terms and Privacy Policy (asked once per version). */
@Component({
  selector: 'app-book-profile',
  imports: [ReactiveFormsModule, FieldError, RouterLink, LegalLinks],
  template: `
    <section class="mx-auto max-w-sm p-4">
      <h1 class="text-xl font-semibold">Your details</h1>
      <p class="mt-1 text-sm text-slate-400">We need your name and phone so the counter can find your booking.</p>
      <form [formGroup]="form" (ngSubmit)="save()" class="mt-4 space-y-3">
        <label class="label">Name
          <input formControlName="name" autocomplete="name" class="field" data-name />
          <app-field-error [control]="form.controls.name" />
        </label>
        <label class="label">Phone
          <input formControlName="phone" inputmode="tel" autocomplete="tel" class="field" data-phone />
          <app-field-error [control]="form.controls.phone" />
        </label>
        @if (needsConsent) {
          <label class="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" formControlName="agree" class="mt-0.5 size-4 shrink-0 accent-violet-500" data-agree />
            <span>I have read the <a routerLink="/terms" target="_blank" rel="noopener" class="text-cyan-300 underline">Terms</a> and the
              <a routerLink="/privacy" target="_blank" rel="noopener" class="text-cyan-300 underline">Privacy Policy</a> and I agree.
              I am 18 or older, or my parent or guardian agrees.</span>
          </label>
          @if (form.controls.agree.touched && form.controls.agree.invalid) {
            <p class="text-sm text-red-400" role="alert" data-agree-error>Please agree to continue.</p>
          }
        }
        @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
        <button type="submit" class="btn-primary w-full" [disabled]="busy()" data-save>
          {{ busy() ? 'Saving…' : 'Save and continue' }}
        </button>
      </form>
      <div class="mt-4"><app-legal-links [newTab]="true" /></div>
    </section>
  `,
})
export class BookProfile implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly svc = inject(BookingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    phone: ['', [Validators.required, phone]],
    agree: [false],
  });
  /** true when this customer still has to agree to the current Terms and Privacy Policy */
  protected needsConsent = false;

  ngOnInit(): void {
    const c = this.auth.customer();
    const p = this.auth.profile();
    this.form.patchValue({ name: c?.name ?? p?.full_name ?? '', phone: c?.phone ?? p?.phone ?? '' });
    this.needsConsent = this.auth.needsConsent();
    if (this.needsConsent) this.form.controls.agree.setValidators([Validators.requiredTrue]);
    this.form.controls.agree.updateValueAndValidity();
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.saveProfile(v.name.trim(), v.phone.trim());
      if (this.needsConsent) await this.auth.recordConsent();
      await this.auth.refreshCustomer();
      await this.router.navigateByUrl(safeNext(this.route.snapshot.queryParamMap.get('next')) ?? '/book');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
