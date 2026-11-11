import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import { Profile, Role } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-staff',
  imports: [ReactiveFormsModule],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Staff</h1>
        <button type="button" (click)="showForm.set(!showForm())"
                class="btn-primary !px-3 !py-1 !text-sm">+ Staff</button>
      </div>

      @if (message(); as m) {
        <p class="mt-3 rounded p-2 text-sm" role="status"
           [class]="m.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'">{{ m.text }}</p>
      }

      @if (showForm()) {
        <form [formGroup]="form" (ngSubmit)="create()" class="mt-4 space-y-3 rounded border border-slate-800 p-3">
          <label class="block text-sm">Name
            <input formControlName="full_name" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2" />
          </label>
          <label class="block text-sm">Email
            <input formControlName="email" type="email" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2" />
          </label>
          <label class="block text-sm">Temporary password (min 8)
            <input formControlName="password" type="text" autocomplete="off"
                   class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2" />
          </label>
          <button type="submit" [disabled]="form.invalid || busy()"
                  class="btn-primary">
            {{ busy() ? 'Creating…' : 'Create staff' }}
          </button>
        </form>
      }

      <ul class="mt-4 divide-y divide-slate-800">
        @for (p of people(); track p.id) {
          <li class="flex flex-wrap items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ p.full_name || '(no name)' }}
                @if (p.id === auth.profile()?.id) { <span class="text-xs text-slate-400">(you)</span> }
              </p>
              <p class="truncate text-sm text-slate-400">{{ p.email }}</p>
            </div>
            <select [value]="p.role" (change)="setRole(p, $event)"
                    class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" aria-label="Role">
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
            <label class="flex items-center gap-1 text-sm">
              <input type="checkbox" [checked]="p.active" (change)="setActive(p, $event)" />
              Active
            </label>
          </li>
        } @empty {
          <li class="py-3 text-slate-400">No staff yet.</li>
        }
      </ul>
    </section>
  `,
})
export class StaffAdmin implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);

  protected readonly people = signal<Profile[]>([]);
  protected readonly showForm = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.pattern(/\S/)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const { data, error } = await this.sb
      .from('profiles')
      .select('id, email, full_name, phone, role, active')
      .in('role', ['admin', 'staff'])
      .order('full_name');
    if (error) return this.fail(error.message);
    this.people.set((data ?? []) as Profile[]);
  }

  protected async create(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.message.set(null);
    const { data, error } = await this.sb.functions.invoke('admin-create-staff', {
      body: this.form.getRawValue(),
    });
    this.busy.set(false);
    if (error) {
      let text = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          text = ((await error.context.json()) as { error?: string }).error ?? text;
        } catch {
          /* keep default text */
        }
      }
      return this.fail(text);
    }
    this.message.set({ ok: true, text: `Created ${(data as { email: string }).email}` });
    this.form.reset();
    this.showForm.set(false);
    await this.load();
  }

  protected async setActive(p: Profile, event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    this.message.set(null);
    const { error } = await this.sb.from('profiles').update({ active: box.checked }).eq('id', p.id);
    if (error) {
      box.checked = p.active; // refused: snap the checkbox back
      this.fail(error.message);
    }
    await this.load();
  }

  protected async setRole(p: Profile, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    this.message.set(null);
    const { error } = await this.sb
      .from('profiles')
      .update({ role: select.value as Role })
      .eq('id', p.id);
    if (error) {
      select.value = p.role; // refused: snap the dropdown back
      this.fail(error.message);
    }
    await this.load();
  }

  private fail(text: string): void {
    this.message.set({ ok: false, text });
  }
}
