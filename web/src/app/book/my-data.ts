import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { LEGAL_VERSION, legalDate } from '../core/legal';
import { friendlyError } from '../shared/errors';
import { ToastService } from '../shared/toast.service';
import { LegalLinks } from '../legal/legal-links';
import { CONFIRM_WORD, confirmMatches, deleteFailure, exportFileName, exportText, MyDataExport } from './my-data-utils';

/** "My data & privacy": what we hold about the signed-in customer, a download, and deleting the account (DPDP rights). */
@Component({
  selector: 'app-my-data',
  imports: [RouterLink, LegalLinks],
  template: `
    <section class="mx-auto max-w-2xl space-y-4 p-4" data-my-data>
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-xl font-semibold">My data &amp; privacy</h1>
        <a routerLink="/book/my-bookings" class="btn">My bookings</a>
      </div>
      <p class="text-sm text-slate-400">This is everything we keep about you. You can see it, correct it, download it, or delete your account.</p>

      @if (loadError()) {
        <p class="text-sm text-red-400" role="alert" data-load-error>{{ loadError() }}</p>
      } @else if (!data()) {
        <p class="text-slate-400">Loading…</p>
      } @else {
        @if (data(); as d) {
          <div class="card space-y-1 text-sm" data-account-card>
            <h2 class="font-medium">Your account</h2>
            <p><span class="text-slate-400">Name:</span> {{ d.account?.name || '—' }}</p>
            <p><span class="text-slate-400">Phone:</span> {{ d.account?.phone || '—' }}</p>
            <p><span class="text-slate-400">Email:</span> {{ d.account?.email || '—' }}</p>
            <p><span class="text-slate-400">You agreed to our Terms and Privacy Policy:</span>
              @if (d.account?.agreed_to_version) { version {{ legalDateText(d.account?.agreed_to_version ?? '') }} }
              @else { not yet }
            </p>
            <p class="pt-1 text-xs text-slate-500">We also keep {{ d.bookings.length }} booking{{ d.bookings.length === 1 ? '' : 's' }},
              {{ d.passes.length }} pass{{ d.passes.length === 1 ? '' : 'es' }} and {{ d.bills.length }} bill{{ d.bills.length === 1 ? '' : 's' }}
              linked to you. The download has all of it.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" (click)="download(d)" data-download>Download my data</button>
            <a routerLink="/book/profile" [queryParams]="{ next: '/book/my-data' }" class="btn" data-correct>Correct my name or phone</a>
            <a routerLink="/account/password" class="btn" data-password>Change password</a>
          </div>
        }

        <div class="card space-y-3 border border-red-500/30" data-delete-card>
          <h2 class="font-medium text-red-300">Delete my account</h2>
          <p class="text-sm text-slate-300">If you delete your account:</p>
          <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Your login is removed and you are signed out.</li>
            <li>Your name, phone and email are wiped from our records.</li>
            <li>You must finish or cancel any upcoming booking first.</li>
            <li>Your bookings, bills and payments stay in the shop's records without your name, because tax law makes us keep them. Nothing about the money changes.</li>
            <li>An unused pass can no longer be used and is not refunded.</li>
            <li>This cannot be undone.</li>
          </ul>
          @if (!confirming()) {
            <button type="button" class="btn !border-red-500/60 !text-red-300" (click)="confirming.set(true)" data-delete-start>Delete my account…</button>
          } @else {
            <label class="label">Type {{ word }} to confirm
              <input class="field" autocomplete="off" [value]="typed()" (input)="typed.set(val($event))" data-delete-typed />
            </label>
            @if (passWarning()) {
              <label class="flex items-start gap-2 text-sm text-amber-300">
                <input type="checkbox" class="mt-0.5 size-4 shrink-0 accent-red-500" [checked]="forfeit()" (change)="forfeit.set(checked($event))" data-delete-forfeit />
                <span>I understand my unused pass can no longer be used and will not be refunded.</span>
              </label>
            }
            @if (error()) { <p class="text-sm text-red-400" role="alert" data-delete-error>{{ error() }}</p> }
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-primary !bg-red-600" [disabled]="busy() || !canDelete()" (click)="remove()" data-delete-confirm>
                {{ busy() ? 'Deleting…' : 'Permanently delete my account' }}
              </button>
              <button type="button" class="btn" (click)="cancel()" data-delete-cancel>Keep my account</button>
            </div>
          }
        </div>
      }
      <div class="pt-2"><app-legal-links /></div>
    </section>
  `,
})
export class MyData implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly word = CONFIRM_WORD;
  protected readonly data = signal<MyDataExport | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly confirming = signal(false);
  protected readonly typed = signal('');
  protected readonly passWarning = signal(false);
  protected readonly forfeit = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected legalDateText = (v: string): string => (v === LEGAL_VERSION ? `${legalDate(v)} (current)` : legalDate(v));

  async ngOnInit(): Promise<void> {
    const { data, error } = await this.sb.rpc('export_my_data');
    if (error) this.loadError.set(friendlyError(error));
    else this.data.set(data as MyDataExport);
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }
  protected canDelete(): boolean {
    return confirmMatches(this.typed()) && (!this.passWarning() || this.forfeit());
  }

  protected cancel(): void {
    this.confirming.set(false);
    this.typed.set('');
    this.error.set(null);
    this.passWarning.set(false);
    this.forfeit.set(false);
  }

  /** Saves the customer's data as a JSON file on their device. */
  protected download(d: MyDataExport): void {
    const blob = new Blob([exportText(d)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected async remove(): Promise<void> {
    if (!this.canDelete()) return;
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.sb.rpc('delete_my_account', { p_forfeit_passes: this.forfeit() });
    this.busy.set(false);
    if (error) {
      const f = deleteFailure(error);
      if (f.passes) this.passWarning.set(true);
      this.error.set(f.text);
      return;
    }
    // the login no longer exists: clear the browser session and go home
    await this.auth.signOut();
    this.toast.success('Your account has been deleted.');
    await this.router.navigateByUrl('/book');
  }
}
