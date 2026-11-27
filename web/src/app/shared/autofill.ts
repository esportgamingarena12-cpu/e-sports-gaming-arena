import { DestroyRef, ElementRef, inject } from '@angular/core';
import { FormGroup } from '@angular/forms';

/**
 * A browser can fill a saved email and password into a login box without telling the page (Chrome does this until the person
 * touches the page). The boxes then look filled, but the form behind them is still empty. This reads what is really in the boxes
 * into the form, so a saved password always works.
 */
export function syncFromBoxes(form: FormGroup, root: ParentNode | null): void {
  if (!root) return;
  for (const el of Array.from(root.querySelectorAll<HTMLInputElement>('input[formControlName]'))) {
    const name = el.getAttribute('formControlName');
    const control = name ? form.get(name) : null;
    if (!control || el.type === 'checkbox' || el.type === 'radio') continue;
    if (control.value !== el.value) {
      control.setValue(el.value);
      control.markAsDirty();
    }
  }
}

/**
 * Keeps one or more login forms in step with their boxes while the page is open (a short check every 400 ms), and returns a function
 * that does the same check on the spot (use it first thing when the person presses Sign in).
 * Call it in a component's constructor. `rootOf` finds the part of the page a form lives in (the whole page when it has one form).
 */
export function watchAutofill(forms: { form: FormGroup; rootOf?: (host: HTMLElement) => ParentNode | null }[]): () => void {
  const host = inject(ElementRef).nativeElement as HTMLElement;
  const run = (): void => {
    for (const f of forms) syncFromBoxes(f.form, f.rootOf ? f.rootOf(host) : host);
  };
  const timer = setInterval(run, 400);
  // and the moment the person touches the page or presses a key (before the key is acted on), so Enter works at once
  host.addEventListener('keydown', run, true);
  host.addEventListener('pointerdown', run, true);
  inject(DestroyRef).onDestroy(() => {
    clearInterval(timer);
    host.removeEventListener('keydown', run, true);
    host.removeEventListener('pointerdown', run, true);
  });
  return run;
}
