import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private next = 1;

  success(text: string): void {
    this.push(text, 'success', 3500);
  }

  error(text: string): void {
    this.push(text, 'error', 7000);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  private push(text: string, kind: Toast['kind'], ms: number): void {
    const id = this.next++;
    this.items.update((list) => [...list, { id, text, kind }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
