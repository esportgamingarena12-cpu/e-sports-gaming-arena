import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/** Shows the first validation message of a control once it has been touched. */
@Component({
  selector: 'app-field-error',
  template: `@if (message(); as m) { <p class="mt-1 text-xs text-red-400" role="alert">{{ m }}</p> }`,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();

  protected message(): string | null {
    const c = this.control();
    if (!c.errors || !(c.touched || c.dirty)) return null;
    const e = c.errors;
    if (e['required'] || e['notBlank']) return 'Required';
    if (e['min']) return `Must be at least ${e['min'].min}`;
    if (e['max']) return `Must be at most ${e['max'].max}`;
    if (e['integer']) return 'Whole number only';
    if (e['upi']) return 'Use the form name@bank';
    if (e['email']) return 'Enter a valid email';
    return 'Invalid value';
  }
}
