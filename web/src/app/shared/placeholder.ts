import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  template: `
    <section class="p-4">
      <h1 class="text-xl font-semibold">{{ title }}</h1>
      <p class="mt-1 text-slate-400">Coming in a later phase.</p>
    </section>
  `,
})
export class Placeholder {
  protected readonly title = inject(ActivatedRoute).snapshot.data['title'] ?? 'Page';
}
