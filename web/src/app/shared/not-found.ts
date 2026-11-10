import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-md p-6 text-center">
      <h1 class="text-4xl font-bold text-emerald-400">404</h1>
      <p class="mt-2 text-slate-400">That page does not exist.</p>
      <a routerLink="/" class="mt-4 inline-block rounded bg-emerald-500 px-4 py-2 font-medium text-slate-950">Go home</a>
    </section>
  `,
})
export class NotFound {}
