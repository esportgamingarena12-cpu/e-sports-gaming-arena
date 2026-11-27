import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { syncFromBoxes } from './autofill';

function page(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('syncFromBoxes (a saved password the browser filled in without telling the page)', () => {
  it('copies what is really in the boxes into the form', () => {
    const root = page('<form><input formControlName="email" value="a@b.in"><input formControlName="password" type="password" value="secret1"></form>');
    const form = new FormGroup({ email: new FormControl(''), password: new FormControl('') });
    syncFromBoxes(form, root);
    expect(form.value).toEqual({ email: 'a@b.in', password: 'secret1' });
    expect(form.controls['email'].dirty).toBe(true);
  });
  it('leaves a value that is already the same alone (no extra change events)', () => {
    const root = page('<input formControlName="email" value="a@b.in">');
    const form = new FormGroup({ email: new FormControl('a@b.in') });
    let changes = 0;
    form.controls['email'].valueChanges.subscribe(() => changes++);
    syncFromBoxes(form, root);
    expect(changes).toBe(0);
  });
  it('ignores tick boxes, boxes with no matching control, and no page', () => {
    const root = page('<input formControlName="remember" type="checkbox" value="on"><input formControlName="other" value="x">');
    const form = new FormGroup({ remember: new FormControl(true), email: new FormControl('keep') });
    syncFromBoxes(form, root);
    expect(form.value).toEqual({ remember: true, email: 'keep' });
    expect(() => syncFromBoxes(form, null)).not.toThrow();
  });
  it('only reads the part of the page it is given', () => {
    const root = page('<form id="a"><input formControlName="password" value="from-a"></form><form id="b"><input formControlName="password" value="from-b"></form>');
    const form = new FormGroup({ password: new FormControl('') });
    syncFromBoxes(form, root.querySelector('#b'));
    expect(form.value.password).toBe('from-b');
  });
});
