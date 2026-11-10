import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-outlet',
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      @for (t of toasts.items(); track t.id) {
        <button type="button" role="status" (click)="toasts.dismiss(t.id)"
                class="pointer-events-auto max-w-sm rounded px-4 py-2 text-left text-sm shadow-lg"
                [class]="t.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'">
          {{ t.text }}
        </button>
      }
    </div>
  `,
})
export class ToastOutlet {
  protected readonly toasts = inject(ToastService);
}
