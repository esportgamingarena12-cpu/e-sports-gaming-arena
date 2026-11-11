import { Component, input } from '@angular/core';
import { Icon } from './icon';

/** Controller mark with the two-line shop name. The full name is kept for screen readers and tests. */
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
        <span class="sr-only">E-Sports Gaming Arena</span>
        <span aria-hidden="true" class="block font-display text-lg font-bold tracking-wider text-slate-50">E-SPORT</span>
        <span aria-hidden="true" class="block font-display text-xs font-bold tracking-[0.22em] text-cyan-300">GAMING ARENA</span>
      </span>
    </span>
  `,
})
export class Logo {
  readonly compact = input(false);
}
