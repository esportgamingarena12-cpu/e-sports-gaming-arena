import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ServerClock } from '../../core/server-clock';
import { activeHappy, daysText, HappyInfo, HappyHoursService, HappyRule, offDateText, timeText, windowText } from '../../core/happy-hours';
import { SupabaseService } from '../../core/supabase.service';
import { typeLabel } from '../../book/portal';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank } from '../../shared/validators';

interface RuleRow {
  id: number;
  name: string;
  days: number[];
  start_time: string;
  end_time: string;
  percent: number;
  station_type: string | null;
  active: boolean;
}
interface OffRow {
  day: string;
  label: string | null;
}

/** Monday first, as people read a week; the number is the database's (0 = Sunday). */
const WEEK = [
  { n: 1, short: 'Mon' },
  { n: 2, short: 'Tue' },
  { n: 3, short: 'Wed' },
  { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' },
  { n: 6, short: 'Sat' },
  { n: 0, short: 'Sun' },
];

const hhmm = (t: string): string => t.slice(0, 5);

@Component({
  selector: 'app-happy-hours-admin',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <h1 class="text-xl font-semibold">Happy hours</h1>
      <p class="mt-1 max-w-2xl text-sm text-slate-400">
        A discount for sessions that <strong>start</strong> inside a happy hour (India time). The price is set when the session starts and stays the same
        until it ends, even if it runs past the end time. Passes are never discounted.
      </p>

      @if (!loaded()) {
        <p class="mt-3 text-slate-400">Loading…</p>
      } @else {
        <div class="mt-4 grid max-w-5xl gap-4 lg:grid-cols-2">
          <!-- master switch and what is running now -->
          <div class="card space-y-3 lg:col-span-2" data-hh-master>
            <label class="flex items-center gap-3">
              <input type="checkbox" [checked]="on()" (change)="setOn($any($event.target).checked)" class="size-5" data-hh-on />
              <span class="font-medium">Happy hours are {{ on() ? 'ON' : 'OFF' }}</span>
            </label>
            <p class="text-xs text-slate-400">Switch off to stop every happy hour at once (for example on a peak day or a holiday week). The rules below are kept.</p>
            <div class="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm" data-hh-status>
              <p class="mb-1 text-xs font-semibold text-slate-400">Right now</p>
              @for (s of statusLines(); track s.type) {
                <p><span class="font-semibold">{{ s.label }}:</span> <span [class]="s.text.startsWith('No') ? 'text-slate-400' : 'text-emerald-300'">{{ s.text }}</span></p>
              }
            </div>
          </div>

          <!-- rules -->
          <div class="space-y-3">
            <h2 class="font-medium">Rules</h2>
            @if (rules().length === 0) { <p class="text-sm text-slate-400" data-hh-empty>No happy hour yet. Add one on the right.</p> }
            @for (r of rules(); track r.id) {
              <div class="card space-y-2" [class.opacity-60]="!r.active" [attr.data-hh-rule]="r.name">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="font-semibold">{{ r.name }} <span class="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">{{ r.percent }}% off</span></p>
                    <p class="text-sm text-slate-300">{{ days(r) }}, {{ window(r) }}</p>
                    <p class="text-xs text-slate-400">{{ r.station_type ? typeName(r.station_type) + ' only' : 'All games' }}{{ r.active ? '' : ' · switched off' }}</p>
                  </div>
                  <label class="flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" [checked]="r.active" (change)="toggleRule(r, $any($event.target).checked)" [attr.aria-label]="'Rule ' + r.name + ' on or off'" data-hh-rule-active /> On
                  </label>
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn !py-1 text-xs" (click)="edit(r)" data-hh-edit>Edit</button>
                  <button type="button" class="btn !py-1 text-xs text-red-300" (click)="remove(r)" data-hh-delete>Delete</button>
                </div>
              </div>
            }
          </div>

          <!-- add / edit -->
          <form [formGroup]="form" (ngSubmit)="save()" class="card space-y-3" data-hh-form>
            <h2 class="font-medium">{{ editingId() ? 'Edit happy hour' : 'Add a happy hour' }}</h2>
            <label class="label">Name
              <input formControlName="name" class="field" maxlength="60" placeholder="Weekday afternoon" data-hh-name />
              <app-field-error [control]="form.controls.name" />
            </label>
            <fieldset>
              <legend class="label">Days</legend>
              <div class="mt-1 flex flex-wrap gap-1.5" data-hh-days>
                @for (d of week; track d.n) {
                  <button type="button" role="checkbox" [attr.aria-checked]="dayOn(d.n)" (click)="toggleDay(d.n)" [attr.data-hh-day]="d.n"
                          class="min-w-12 rounded-lg border px-3 py-1.5 text-sm font-medium"
                          [class]="dayOn(d.n) ? 'border-cyan-300/80 bg-cyan-300/15 text-cyan-100' : 'border-slate-700 text-slate-400'">{{ d.short }}</button>
                }
              </div>
              @if (daysError()) { <p class="mt-1 text-xs text-red-400">{{ daysError() }}</p> }
            </fieldset>
            <div class="grid grid-cols-2 gap-3">
              <label class="label">From
                <input type="time" formControlName="start" class="field" data-hh-start />
              </label>
              <label class="label">Until
                <input type="time" formControlName="end" class="field" data-hh-end />
              </label>
            </div>
            @if (timeError()) { <p class="text-xs text-red-400">{{ timeError() }}</p> }
            <div class="grid grid-cols-2 gap-3">
              <label class="label">Discount (%)
                <input type="number" formControlName="percent" inputmode="numeric" class="field" min="1" max="90" data-hh-percent />
                <app-field-error [control]="form.controls.percent" />
              </label>
              <label class="label">Applies to
                <select formControlName="station_type" class="field" data-hh-type>
                  <option value="">All games</option>
                  @for (t of types(); track t) { <option [value]="t">{{ typeName(t) }} only</option> }
                </select>
              </label>
            </div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="active" class="size-4" /> This happy hour is on</label>
            <p class="text-xs text-slate-400">Starts at the "From" time and stops at the "Until" time (a session starting exactly at "Until" is not discounted). It cannot run past midnight.</p>
            <div class="flex gap-2">
              <button type="submit" class="btn-primary" [disabled]="busy()" data-hh-save>{{ busy() ? 'Saving…' : editingId() ? 'Save changes' : 'Add happy hour' }}</button>
              @if (editingId()) { <button type="button" class="btn" (click)="resetForm()">Cancel</button> }
            </div>
          </form>

          <!-- off dates -->
          <div class="card space-y-3 lg:col-span-2" data-hh-off>
            <h2 class="font-medium">No happy hour on these dates</h2>
            <p class="text-xs text-slate-400">Holidays, match days or other peak days. Nothing is discounted on these dates, even inside a happy hour.</p>
            <form [formGroup]="offForm" (ngSubmit)="addOff()" class="flex flex-wrap items-end gap-2">
              <label class="label">Date
                <input type="date" formControlName="day" class="field" data-hh-off-day />
              </label>
              <label class="label grow">Reason (optional)
                <input formControlName="label" class="field" maxlength="60" placeholder="Diwali" data-hh-off-label />
              </label>
              <button type="submit" class="btn-primary" [disabled]="offForm.invalid || busy()" data-hh-off-add>Add date</button>
            </form>
            <ul class="flex flex-wrap gap-2" data-hh-off-list>
              @for (o of offDates(); track o.day) {
                <li class="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-sm">
                  <span>{{ offText(o.day) }}{{ o.label ? ' · ' + o.label : '' }}</span>
                  <button type="button" class="text-slate-400 hover:text-red-300" (click)="removeOff(o)" [attr.aria-label]="'Remove ' + o.day">✕</button>
                </li>
              }
              @if (offDates().length === 0) { <li class="text-sm text-slate-500">None yet.</li> }
            </ul>
          </div>

          <p class="text-xs text-slate-400 lg:col-span-2" data-hh-count>Sessions started in a happy hour in the last 30 days: <strong>{{ recentCount() }}</strong>.</p>
        </div>
      }
    </section>
  `,
})
export class HappyHoursAdmin implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ServerClock);
  private readonly happy = inject(HappyHoursService);

  protected readonly week = WEEK;
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly on = signal(false);
  protected readonly rules = signal<RuleRow[]>([]);
  protected readonly offDates = signal<OffRow[]>([]);
  protected readonly types = signal<string[]>([]);
  protected readonly recentCount = signal(0);
  protected readonly editingId = signal<number | null>(null);
  private readonly picked = signal<number[]>([1, 2, 3, 4, 5]);
  protected readonly daysError = signal<string | null>(null);
  protected readonly timeError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank, Validators.maxLength(60)]],
    start: ['15:00', Validators.required],
    end: ['18:00', Validators.required],
    percent: [20, [Validators.required, Validators.min(1), Validators.max(90), integer]],
    station_type: [''],
    active: [true],
  });
  protected readonly offForm = this.fb.nonNullable.group({
    day: ['', Validators.required],
    label: ['', Validators.maxLength(60)],
  });

  protected typeName = typeLabel;
  protected days = (r: RuleRow): string => daysText(r.days);
  protected window = (r: RuleRow): string => windowText({ start: hhmm(r.start_time), end: hhmm(r.end_time) });
  protected offText = offDateText;
  protected dayOn = (n: number): boolean => this.picked().includes(n);

  /** What is running at this moment for each game type (the same check the counter uses). */
  protected readonly statusLines = computed(() => {
    const info = this.asInfo();
    const now = this.clock.now();
    const lines = this.types().map((t) => {
      const h = activeHappy(info, t, now);
      return {
        type: t,
        label: typeLabel(t),
        text: !this.on() ? 'No happy hour (switched off)' : h ? `${h.percent}% off until ${timeText(h.end)} (${h.name})` : 'No happy hour right now',
      };
    });
    return lines.length > 0 ? lines : [{ type: '', label: 'All games', text: this.on() ? 'No stations yet' : 'No happy hour (switched off)' }];
  });

  private asInfo(): HappyInfo {
    return {
      on: this.on(),
      rules: this.rules()
        .filter((r) => r.active)
        .map<HappyRule>((r) => ({ name: r.name, days: r.days, start: hhmm(r.start_time), end: hhmm(r.end_time), percent: r.percent, station_type: r.station_type })),
      off_dates: this.offDates(),
    };
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.loaded.set(true);
  }

  private async reload(): Promise<void> {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [s, r, o, st, c] = await Promise.all([
      this.sb.from('settings').select('happy_hours_on').maybeSingle(),
      this.sb.from('happy_hours').select('id, name, days, start_time, end_time, percent, station_type, active').order('start_time').order('id'),
      this.sb.from('happy_hour_off_dates').select('day, label').order('day'),
      this.sb.from('stations').select('type').eq('active', true),
      this.sb.from('sessions').select('id', { count: 'exact', head: true }).gt('happy_pct', 0).gte('started_at', since),
    ]);
    const err = s.error ?? r.error ?? o.error ?? st.error;
    if (err) {
      this.toast.error(friendlyError(err));
      return;
    }
    this.on.set(s.data?.happy_hours_on === true);
    this.rules.set((r.data ?? []) as RuleRow[]);
    this.offDates.set((o.data ?? []) as OffRow[]);
    this.types.set([...new Set(((st.data ?? []) as { type: string }[]).map((x) => x.type))].sort());
    this.recentCount.set(c.count ?? 0);
  }

  private async changed(): Promise<void> {
    await this.reload();
    void this.happy.refresh(); // the public page and the counter follow at once
  }

  protected async setOn(value: boolean): Promise<void> {
    const { data, error } = await this.sb.from('settings').update({ happy_hours_on: value, updated_at: new Date().toISOString() }).eq('id', true).select('id');
    if (error) return this.toast.error(friendlyError(error));
    if (!data?.length) return this.toast.error('Not allowed');
    this.toast.success(value ? 'Happy hours are on' : 'Happy hours are off');
    await this.changed();
  }

  protected toggleDay(n: number): void {
    this.picked.update((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
    this.daysError.set(null);
  }

  protected edit(r: RuleRow): void {
    this.editingId.set(r.id);
    this.picked.set([...r.days]);
    this.form.setValue({ name: r.name, start: hhmm(r.start_time), end: hhmm(r.end_time), percent: r.percent, station_type: r.station_type ?? '', active: r.active });
    this.daysError.set(null);
    this.timeError.set(null);
  }

  protected resetForm(): void {
    this.editingId.set(null);
    this.picked.set([1, 2, 3, 4, 5]);
    this.form.reset({ name: '', start: '15:00', end: '18:00', percent: 20, station_type: '', active: true });
    this.daysError.set(null);
    this.timeError.set(null);
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    this.daysError.set(this.picked().length === 0 ? 'Choose at least one day.' : null);
    this.timeError.set(v.start && v.end && v.start >= v.end ? 'The end time must be after the start time (a happy hour cannot run past midnight).' : null);
    if (this.form.invalid || this.daysError() || this.timeError()) {
      this.form.markAllAsTouched();
      return;
    }
    const row = {
      name: v.name.trim(),
      days: [...this.picked()].sort((a, b) => a - b),
      start_time: v.start,
      end_time: v.end,
      percent: Number(v.percent),
      station_type: v.station_type === '' ? null : v.station_type,
      active: v.active,
    };
    this.busy.set(true);
    const id = this.editingId();
    const { error } = id ? await this.sb.from('happy_hours').update(row).eq('id', id) : await this.sb.from('happy_hours').insert(row);
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    this.toast.success(id ? 'Happy hour saved' : 'Happy hour added');
    this.resetForm();
    await this.changed();
  }

  protected async toggleRule(r: RuleRow, active: boolean): Promise<void> {
    const { error } = await this.sb.from('happy_hours').update({ active }).eq('id', r.id);
    if (error) return this.toast.error(friendlyError(error));
    await this.changed();
  }

  protected async remove(r: RuleRow): Promise<void> {
    if (!confirm(`Delete the happy hour "${r.name}"? Sessions already started keep their discount.`)) return;
    const { error } = await this.sb.from('happy_hours').delete().eq('id', r.id);
    if (error) return this.toast.error(friendlyError(error));
    if (this.editingId() === r.id) this.resetForm();
    this.toast.success('Deleted');
    await this.changed();
  }

  protected async addOff(): Promise<void> {
    const v = this.offForm.getRawValue();
    if (!v.day) return;
    this.busy.set(true);
    const { error } = await this.sb.from('happy_hour_off_dates').upsert({ day: v.day, label: v.label.trim() === '' ? null : v.label.trim() });
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    this.offForm.reset({ day: '', label: '' });
    await this.changed();
  }

  protected async removeOff(o: OffRow): Promise<void> {
    const { error } = await this.sb.from('happy_hour_off_dates').delete().eq('day', o.day);
    if (error) return this.toast.error(friendlyError(error));
    await this.changed();
  }
}
