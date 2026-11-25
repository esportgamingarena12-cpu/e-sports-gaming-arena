import { Component, computed, inject, input } from '@angular/core';
import { BrandingService, titleLines } from '../core/branding';
import { Icon } from './icon';

/** Controller mark with the shop name on two lines (first word over the rest). The full name is kept for screen readers and tests. */
@Component({
  selector: 'app-logo',
  imports: [Icon],
  template: `
    <span class="flex items-center gap-2">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-linear-to-br from-violet-500 to-cyan-400 text-slate-950
                   shadow-[0_0_18px_-4px_rgb(139_92_246_/_0.9)]">
        <app-icon name="gamepad" [size]="22" />
      </span>
      <span class="leading-none" [class.hidden]="compact()">
        <span class="sr-only">{{ name() }}</span>
        @if (lines().top) {
          <span aria-hidden="true" class="block font-display text-lg font-bold tracking-wider text-slate-50">{{ lines().top }}</span>
          <span aria-hidden="true" class="block font-display text-xs font-bold tracking-[0.22em] text-cyan-300">{{ lines().main }}</span>
        } @else {
          <span aria-hidden="true" class="block font-display text-lg font-bold tracking-wider text-slate-50">{{ lines().main }}</span>
        }
      </span>
    </span>
  `,
})
export class Logo {
  readonly compact = input(false);
  private readonly branding = inject(BrandingService);
  protected readonly name = computed(() => this.branding.brand().shop_name);
  protected readonly lines = computed(() => titleLines(this.name()));
}
