import { Component, computed, input } from '@angular/core';
import { posterInitial } from '../book/games';
import { gameImageUrl } from './food-image';

/** A game poster, or a coloured tile with the game's first letter when there is no photo. */
@Component({
  selector: 'app-game-poster',
  template: `
    @if (url(); as u) {
      <img [src]="u" [alt]="title()" loading="lazy" decoding="async" class="size-full object-cover" data-poster-img />
    } @else {
      <span class="grid size-full place-items-center bg-linear-to-br from-violet-700/60 via-fuchsia-600/30 to-cyan-400/20 font-display text-5xl font-bold text-violet-50" aria-hidden="true" data-poster-fallback>
        {{ initial() }}
      </span>
    }
  `,
  host: { class: 'block overflow-hidden' },
})
export class GamePoster {
  readonly path = input<string | null | undefined>(null);
  readonly title = input('');
  protected readonly url = computed(() => gameImageUrl(this.path()));
  protected readonly initial = computed(() => posterInitial(this.title()));
}
