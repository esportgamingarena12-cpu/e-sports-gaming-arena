import { Component, contentChildren, Directive, effect, input, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { Icon } from './icon';
import { nextIndex, prevIndex, swipeDirection } from './slider-utils';

/** One slide. Put `appSlide` on each direct child of <app-hero-slider>; hidden slides are skipped by screen readers and Tab. */
@Directive({
  selector: '[appSlide]',
  host: {
    class: 'w-full shrink-0 grow-0 basis-full',
    role: 'group',
    'aria-roledescription': 'slide',
    '[attr.aria-label]': 'label()',
    '[attr.aria-hidden]': 'active() ? null : "true"',
    '[attr.inert]': 'active() ? null : ""',
    '[attr.data-slide]': 'index()',
    '[attr.data-active]': 'active()',
  },
})
export class HeroSlide {
  readonly index = signal(0);
  readonly total = signal(1);
  readonly active = signal(true);
  protected readonly label = computed(() => `${this.index() + 1} of ${this.total()}`);
}

/**
 * A slider: auto-plays, pauses while the pointer or keyboard focus is inside it, can be swiped on a phone, moved
 * with the arrow buttons, the dots or the left and right arrow keys. For people who ask their device for less
 * motion it does not auto-play and the slides switch without sliding.
 */
@Component({
  selector: 'app-hero-slider',
  imports: [Icon],
  template: `
    <div class="relative" role="region" aria-roledescription="carousel" [attr.aria-label]="label()" tabindex="0"
         (keydown)="onKey($event)" (mouseenter)="hold.set(true)" (mouseleave)="hold.set(false)"
         (focusin)="hold.set(true)" (focusout)="hold.set(false)" data-slider>
      <div class="overflow-hidden">
        <div class="flex ease-out motion-reduce:transition-none" [class]="animate() ? 'transition-transform duration-700' : ''" style="touch-action: pan-y"
             [style.transform]="'translateX(' + -index() * 100 + '%)'"
             (pointerdown)="down($event)" (pointerup)="up($event)" (pointercancel)="startX = null" aria-live="off">
          <ng-content />
        </div>
      </div>

      @if (count() > 1) {
        <div class="mt-5 flex items-center justify-center gap-3" data-slider-controls>
          <button type="button" class="grid size-10 place-items-center rounded-full border border-violet-400/50 bg-slate-900/70 text-violet-100 transition hover:border-cyan-300 hover:text-cyan-200 hover:shadow-[0_0_18px_-4px_rgb(34_211_238_/_0.8)]"
                  (click)="prev()" aria-label="Previous slide" data-prev>
            <span class="rotate-180"><app-icon name="arrow" [size]="18" /></span>
          </button>
          <div class="flex items-center gap-2" role="tablist" aria-label="Choose a slide">
            @for (d of dots(); track d) {
              <button type="button" role="tab" class="h-2.5 rounded-full transition-all duration-300"
                      [class]="d === index() ? 'w-8 bg-linear-to-r from-violet-500 to-fuchsia-400 shadow-[0_0_12px_rgb(217_70_239_/_0.8)]' : 'w-2.5 bg-slate-600 hover:bg-slate-400'"
                      [attr.aria-selected]="d === index()" [attr.aria-label]="'Go to slide ' + (d + 1)" (click)="go(d)" data-dot [attr.data-dot-index]="d"></button>
            }
          </div>
          <button type="button" class="grid size-10 place-items-center rounded-full border border-violet-400/50 bg-slate-900/70 text-violet-100 transition hover:border-cyan-300 hover:text-cyan-200 hover:shadow-[0_0_18px_-4px_rgb(34_211_238_/_0.8)]"
                  (click)="next()" aria-label="Next slide" data-next>
            <app-icon name="arrow" [size]="18" />
          </button>
        </div>
      }
    </div>
  `,
})
export class HeroSlider implements OnInit, OnDestroy {
  readonly interval = input(7000);
  readonly label = input('Highlights');

  private readonly slides = contentChildren(HeroSlide);
  protected readonly count = computed(() => this.slides().length);
  protected readonly dots = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  protected readonly index = signal(0);
  /** off for a moment when the slider wraps from the last slide to the first (or back), so it does not rewind across every slide */
  protected readonly animate = signal(true);
  /** true while the pointer or focus is inside: auto-play waits */
  protected readonly hold = signal(false);

  protected startX: number | null = null;
  private startY = 0;
  private timer?: ReturnType<typeof setInterval>;
  private readonly reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    // tell each slide its place and whether it is the one showing; keep the position valid if slides come and go
    effect(() => {
      const all = this.slides();
      if (this.index() > Math.max(0, all.length - 1)) this.index.set(Math.max(0, all.length - 1));
      all.forEach((s, i) => {
        s.index.set(i);
        s.total.set(all.length);
        s.active.set(i === this.index());
      });
    });
  }

  ngOnInit(): void {
    this.restart();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** (Re)starts the auto-play clock, so a slide always gets its full time after the visitor moves it. */
  private restart(): void {
    clearInterval(this.timer);
    if (this.reduced) return;
    this.timer = setInterval(() => {
      if (!this.hold() && !document.hidden && this.count() > 1) this.move(nextIndex(this.index(), this.count()));
    }, this.interval());
  }

  /** Shows slide `to`. A jump from the last slide to the first (or the reverse) is instant instead of sliding back across them all. */
  private move(to: number): void {
    const last = this.count() - 1;
    const wraps = this.count() > 2 && ((this.index() === last && to === 0) || (this.index() === 0 && to === last));
    if (!wraps) {
      this.index.set(to);
      return;
    }
    this.animate.set(false);
    this.index.set(to);
    requestAnimationFrame(() => requestAnimationFrame(() => this.animate.set(true)));
  }

  protected go(i: number): void {
    this.move(Math.min(Math.max(0, i), Math.max(0, this.count() - 1)));
    this.restart();
  }

  protected next(): void {
    this.move(nextIndex(this.index(), this.count()));
    this.restart();
  }

  protected prev(): void {
    this.move(prevIndex(this.index(), this.count()));
    this.restart();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.prev();
    }
  }

  protected down(e: PointerEvent): void {
    this.startX = e.clientX;
    this.startY = e.clientY;
  }

  protected up(e: PointerEvent): void {
    if (this.startX === null) return;
    const dir = swipeDirection(e.clientX - this.startX, e.clientY - this.startY);
    this.startX = null;
    if (dir === 'next') this.next();
    else if (dir === 'prev') this.prev();
  }
}
