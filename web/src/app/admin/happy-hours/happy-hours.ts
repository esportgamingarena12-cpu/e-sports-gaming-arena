import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ServerClock } from '../../core/server-clock';
import { activeHappy, daysText, HappyInfo, HappyHoursService, HappyRule, offDateText, timeText, windowText } from '../../core/happy-hours';
import { SupabaseService } from '../../core/supabase.service';
import { typeLabel } from '../../book/portal';
import { friendlyError } from '../../shared/errors';
import { Icon } from '../../shared/icon';
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
  imports: [ReactiveFormsModule, FieldError, Icon],
  template: `
    <section class="relative p-4">
      <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-radial from-emerald-500/15 via-violet-700/10 to-transparent" aria-hidden="true"></div>

      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-display text-3xl font-bold tracking-wide sm:text-4xl">Happy <span class="text-emerald-300">hours</span></h1>
          <p class="mt-1 max-w-2xl text-sm text-slate-400">
            A discount for sessions that <strong class="text-slate-200">start</strong> inside a happy hour (India time). The price is set when the session starts and stays
            until it ends, even past the end time. Passes are never discounted.
          </p>
        </div>
        <div class="rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-right" data-hh-count>
          <p class="font-display text-3xl font-bold leading-none text-emerald-300">{{ recentCount() }}</p>
          <p class="text-xs text-slate-400">sessions in a happy hour, last 30 days</p>
        </div>
      </div>

      @if (!loaded()) {
        <p class="mt-4 text-slate-400">Loading…</p>
      } @else {
        <!-- master switch and what is running now -->
        <div class="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]" data-hh-master>
          <div class="rounded-3xl border p-5 backdrop-blur transition"
               [class]="on() ? 'border-emerald-400/50 bg-linear-to-br from-emerald-600/25 via-slate-900/80 to-slate-900/80 shadow-[0_0_60px_-22px_rgb(52_211_153_/_0.8)]' : 'border-slate-700/70 bg-slate-900/70'">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-display text-2xl font-bold">Happy hours are {{ on() ? 'ON' : 'OFF' }}</p>
                <p class="mt-1 text-xs text-slate-400">The master switch. Turn it off to stop every happy hour at once, for example on a peak day. Your rules are kept.</p>
              </div>
              <button type="button" role="switch" [attr.aria-checked]="on()" (click)="setOn(!on())" [attr.aria-label]="'Happy hours on or off'"
                class="relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-2 focus-visible:outline-cyan-300"
                [class]="on() ? 'border-emerald-300/70 bg-emerald-500/40 shadow-[0_0_20px_-4px_rgb(52_211_153_/_0.9)]' : 'border-slate-600 bg-slate-800'" data-hh-on>
                <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" [class]="on() ? 'left-6' : 'left-0.5'"></span>
              </button>
            </div>
          </div>

          <div class="rounded-3xl border border-slate-700/70 bg-slate-900/70 p-5 backdrop-blur" data-hh-status>
            <p class="text-xs font-semibold text-slate-400">Right now</p>
            <ul class="mt-2 grid gap-2 sm:grid-cols-2">
              @for (s of statusLines(); track s.type) {
                <li class="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                    [class]="s.live ? 'border-emerald-300/60 bg-emerald-400/10' : 'border-slate-700/60 bg-slate-950/50'">
                  <span class="relative flex size-2.5 shrink-0">
                    @if (s.live) { <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span> }
                    <span class="relative inline-flex size-2.5 rounded-full" [class]="s.live ? 'bg-emerald-400' : 'bg-slate-600'"></span>
                  </span>
                  <span class="min-w-0 text-sm">
                    <span class="block font-semibold">{{ s.label }}</span>
                    <span class="block truncate" [class]="s.live ? 'text-emerald-200' : 'text-slate-400'">{{ s.text }}</span>
                  </span>
                </li>
              }
            </ul>
          </div>
        </div>

        <div class="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <!-- rules -->
          <div class="space-y-3">
            <h2 class="font-display text-xl font-bold">Your happy hours</h2>
            @if (rules().length === 0) {
              <div class="rounded-3xl border border-dashed border-slate-600 p-8 text-center" data-hh-empty>
                <p class="font-display text-xl font-bold">No happy hour yet</p>
                <p class="mt-1 text-sm text-slate-400">Add your first one on the right, for example Monday to Friday, 3 to 6 pm, 20% off.</p>
              </div>
            }
            @for (r of rules(); track r.id) {
              <div class="group relative overflow-hidden rounded-3xl border bg-slate-900/70 p-4 backdrop-blur transition hover:-translate-y-0.5"
                   [class]="r.active ? 'border-emerald-400/40 shadow-[0_0_40px_-22px_rgb(52_211_153_/_0.8)]' : 'border-slate-700/70 opacity-70'" [attr.data-hh-rule]="r.name">
                <span class="absolute inset-y-0 left-0 w-1" [class]="r.active ? 'bg-linear-to-b from-emerald-300 to-cyan-400' : 'bg-slate-600'" aria-hidden="true"></span>
                <div class="flex items-start gap-4 pl-2">
                  <div class="grid size-16 shrink-0 place-items-center rounded-2xl text-center" [class]="r.active ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-slate-400'">
                    <span class="font-display text-3xl font-bold leading-none">{{ r.percent }}<span class="text-base">%</span></span>
                    <span class="-mt-3 text-[10px] font-semibold">off</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-display text-xl font-bold">{{ r.name }}</p>
                    <p class="mt-0.5 flex items-center gap-1.5 text-sm text-slate-300"><app-icon name="clock" [size]="15" />{{ window(r) }}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-1" aria-label="Days">
                      @for (d of week; track d.n) {
                        <span class="grid size-7 place-items-center rounded-full text-[10px] font-semibold"
                              [class]="r.days.includes(d.n) ? 'bg-cyan-300/20 text-cyan-100 ring-1 ring-cyan-300/50' : 'bg-slate-800/70 text-slate-600'">{{ d.short.slice(0, 2) }}</span>
                      }
                      <span class="ml-1 rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">{{ r.station_type ? typeName(r.station_type) + ' only' : 'All games' }}</span>
                    </div>
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-2">
                    <button type="button" role="switch" [attr.aria-checked]="r.active" (click)="toggleRule(r, !r.active)" [attr.aria-label]="'Rule ' + r.name + ' on or off'"
                class="relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-2 focus-visible:outline-cyan-300"
                [class]="r.active ? 'border-emerald-300/70 bg-emerald-500/40 shadow-[0_0_20px_-4px_rgb(52_211_153_/_0.9)]' : 'border-slate-600 bg-slate-800'" data-hh-rule-active>
                <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" [class]="r.active ? 'left-6' : 'left-0.5'"></span>
              </button>
                  </div>
                </div>
                <div class="mt-3 flex gap-2 pl-2">
                  <button type="button" class="btn !py-1 text-xs" (click)="edit(r)" data-hh-edit>Edit</button>
                  <button type="button" class="btn !py-1 text-xs text-red-300" (click)="remove(r)" data-hh-delete>Delete</button>
                </div>
              </div>
            }
          </div>

          <!-- add / edit -->
          <form [formGroup]="form" (ngSubmit)="save()" class="h-fit space-y-4 rounded-3xl border border-violet-400/30 bg-slate-900/70 p-5 shadow-[0_0_60px_-28px_rgb(139_92_246_/_0.9)] backdrop-blur" data-hh-form>
            <div class="flex items-center gap-2">
              <span class="grid size-8 place-items-center rounded-xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white"><app-icon name="plus" [size]="18" /></span>
              <h2 class="font-display text-xl font-bold">{{ editingId() ? 'Edit happy hour' : 'Add a happy hour' }}</h2>
            </div>
            <label class="label">Name
              <input formControlName="name" class="field" maxlength="60" placeholder="Weekday afternoon" data-hh-name />
              <app-field-error [control]="form.controls.name" />
            </label>
            <fieldset>
              <legend class="label">Days</legend>
              <div class="mt-1 flex flex-wrap gap-1.5" data-hh-days>
                @for (d of week; track d.n) {
                  <button type="button" role="checkbox" [attr.aria-checked]="dayOn(d.n)" (click)="toggleDay(d.n)" [attr.data-hh-day]="d.n"
                          class="min-w-12 rounded-full border px-3 py-1.5 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300"
                          [class]="dayOn(d.n) ? 'border-cyan-300/80 bg-cyan-300/15 text-cyan-100 shadow-[0_0_18px_-6px_rgb(34_211_238_/_0.9)]' : 'border-slate-700 text-slate-400 hover:border-violet-300/60'">{{ d.short }}</button>
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
            <div>
              <label class="label">Discount (%)
                <input type="number" formControlName="percent" inputmode="numeric" class="field" min="1" max="90" data-hh-percent />
                <app-field-error [control]="form.controls.percent" />
              </label>
              <div class="mt-2 flex flex-wrap gap-1.5" aria-label="Quick choices">
                @for (q of quickPercents; track q) {
                  <button type="button" (click)="setPercent(q)" class="rounded-full border px-3 py-1 text-xs font-semibold transition"
                          [class]="form.controls.percent.value === q ? 'border-emerald-300/70 bg-emerald-400/15 text-emerald-200' : 'border-slate-700 text-slate-400 hover:border-emerald-300/50'">{{ q }}%</button>
                }
              </div>
            </div>
            <label class="label">Applies to
              <select formControlName="station_type" class="field" data-hh-type>
                <option value="">All games</option>
                @for (t of types(); track t) { <option [value]="t">{{ typeName(t) }} only</option> }
              </select>
            </label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="active" class="size-4" /> This happy hour is on</label>
            <p class="text-xs text-slate-400">It starts at "From" and stops at "Until" (a session starting exactly at "Until" is not discounted). It cannot run past midnight.</p>
            <div class="flex gap-2">
              <button type="submit" class="btn-primary" [disabled]="busy()" data-hh-save>{{ busy() ? 'Saving…' : editingId() ? 'Save changes' : 'Add happy hour' }}</button>
              @if (editingId()) { <button type="button" class="btn" (click)="resetForm()">Cancel</button> }
            </div>
          </form>
        </div>

        <!-- off dates -->
        <div class="mt-5 rounded-3xl border border-slate-700/70 bg-slate-900/70 p-5 backdrop-blur" data-hh-off>
          <div class="flex items-center gap-2">
            <span class="grid size-8 place-items-center rounded-xl bg-amber-400/15 text-amber-200"><app-icon name="calendar" [size]="18" /></span>
            <h2 class="font-display text-xl font-bold">No happy hour on these dates</h2>
          </div>
          <p class="mt-1 text-xs text-slate-400">Holidays, match days or other peak days. Nothing is discounted on these dates, even inside a happy hour.</p>
          <form [formGroup]="offForm" (ngSubmit)="addOff()" class="mt-3 flex flex-wrap items-end gap-2">
            <label class="label">Date
              <input type="date" formControlName="day" class="field" data-hh-off-day />
            </label>
            <label class="label grow">Reason (optional)
              <input formControlName="label" class="field" maxlength="60" placeholder="Diwali" data-hh-off-label />
            </label>
            <button type="submit" class="btn-primary" [disabled]="offForm.invalid || busy()" data-hh-off-add>Add date</button>
          </form>
          <ul class="mt-3 flex flex-wrap gap-2" data-hh-off-list>
            @for (o of offDates(); track o.day) {
              <li class="flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm text-amber-100">
                <span>{{ offText(o.day) }}{{ o.label ? ' · ' + o.label : '' }}</span>
                <button type="button" class="text-amber-200/70 hover:text-red-300" (click)="removeOff(o)" [attr.aria-label]="'Remove ' + o.day">✕</button>
              </li>
            }
            @if (offDates().length === 0) { <li class="text-sm text-slate-500">None yet.</li> }
          </ul>
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

  protected readonly quickPercents = [10, 15, 20, 25, 30, 50];
  protected setPercent(n: number): void {
    this.form.controls.percent.setValue(n);
  }

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
        live: this.on() && h !== null,
        text: !this.on() ? 'Switched off' : h ? `${h.percent}% off until ${timeText(h.end)}` : 'No happy hour right now',
      };
    });
    return lines.length > 0 ? lines : [{ type: '', label: 'All games', live: false, text: this.on() ? 'No stations yet' : 'Switched off' }];
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
