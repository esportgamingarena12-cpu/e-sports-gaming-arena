import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LEGAL_VERSION, LegalInfo, LegalService, legalDate } from '../core/legal';
import { LegalLinks } from './legal-links';
import { Block, LegalPageKey, PAGE_TITLES, Section, sectionsFor } from './legal-content';

const EMPTY: LegalInfo = {
  shop_name: null, legal_name: null, address: null, phone: null, gstin: null,
  grievance_name: null, grievance_email: null, grievance_phone: null,
  refund_days: 7, record_years: 8, cutoff_hours: null,
};

/** One public legal page (Terms, Privacy, Refunds, Contact & Grievance). The route says which. Needs no login. */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, LegalLinks],
  template: `
    <article class="mx-auto max-w-3xl px-4 py-6" [attr.data-legal-page]="page()">
      <a routerLink="/book" class="text-sm text-violet-300 underline hover:text-violet-200" data-legal-back>&larr; Back to booking</a>
      <h1 class="mt-3 font-display text-3xl font-bold tracking-wide text-slate-50" data-legal-title>{{ title() }}</h1>
      @if (page() !== 'grievance') {
        <p class="mt-1 text-xs text-slate-400" data-legal-version>Last updated {{ updated }} · version {{ version }}</p>
      }
      <div class="mt-5 space-y-6">
        @for (s of sections(); track s.title) {
          <section [attr.data-section]="s.title">
            <h2 class="text-lg font-semibold text-slate-100">{{ s.title }}</h2>
            @for (b of s.body; track $index) {
              @if (isList(b)) {
                <ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
                  @for (li of listOf(b); track $index) { <li>{{ li }}</li> }
                </ul>
              } @else {
                <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ b }}</p>
              }
            }
          </section>
        }
      </div>
      <hr class="my-8 border-slate-800" />
      <app-legal-links />
    </article>
  `,
})
export class LegalPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(LegalService);

  protected readonly page = signal<LegalPageKey>('terms');
  protected readonly info = signal<LegalInfo>(EMPTY);
  protected readonly version = LEGAL_VERSION;
  protected readonly updated = legalDate(LEGAL_VERSION);

  protected title(): string {
    return PAGE_TITLES[this.page()];
  }
  protected sections(): Section[] {
    return sectionsFor(this.page(), this.info());
  }
  protected isList(b: Block): boolean {
    return typeof b !== 'string';
  }
  protected listOf(b: Block): string[] {
    return typeof b === 'string' ? [] : b.list;
  }

  ngOnInit(): void {
    this.page.set((this.route.snapshot.data['page'] as LegalPageKey) ?? 'terms');
    // the words still show if the shop details cannot be loaded
    void this.svc.info().then((i) => this.info.set(i)).catch(() => undefined);
  }
}
