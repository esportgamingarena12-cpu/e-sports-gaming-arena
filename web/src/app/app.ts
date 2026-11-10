import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly appName = 'E Gaming Era';
  // Placeholder nav; becomes role-based in Phase 2.
  protected readonly nav = signal([
    { label: 'Book', path: '/book' },
    { label: 'Counter', path: '/counter' },
    { label: 'Admin', path: '/admin' },
  ]);
}
