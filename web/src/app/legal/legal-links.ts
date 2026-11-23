import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** The four public legal pages, as a row of links (footers, sign-up, profile). Opens in a new tab so a half-filled form is not lost. */
@Component({
  selector: 'app-legal-links',
  imports: [RouterLink],
  template: `
    <nav class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400" aria-label="Legal" data-legal-links>
      <a routerLink="/terms" [target]="newTab() ? '_blank' : '_self'" rel="noopener" class="underline hover:text-slate-200" data-link-terms>Terms</a>
      <span aria-hidden="true">·</span>
      <a routerLink="/privacy" [target]="newTab() ? '_blank' : '_self'" rel="noopener" class="underline hover:text-slate-200" data-link-privacy>Privacy</a>
      <span aria-hidden="true">·</span>
      <a routerLink="/refunds" [target]="newTab() ? '_blank' : '_self'" rel="noopener" class="underline hover:text-slate-200" data-link-refunds>Refunds</a>
      <span aria-hidden="true">·</span>
      <a routerLink="/grievance" [target]="newTab() ? '_blank' : '_self'" rel="noopener" class="underline hover:text-slate-200" data-link-grievance>Contact &amp; grievance</a>
    </nav>
  `,
})
export class LegalLinks {
  /** open the pages in a new tab (use on forms) */
  readonly newTab = input(false);
}
