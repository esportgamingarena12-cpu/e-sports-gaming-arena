import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Brand, BrandingService, DEFAULT_BRAND, mergeBrand } from '../../core/branding';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { notBlank } from '../../shared/validators';

/** Settings columns that hold the wording (a column is null while the standard wording is used). */
const COLUMNS =
  'shop_name, brand_tagline, brand_hero_text, brand_features, brand_studio_title, brand_studio_text, brand_checks, ' +
  'brand_rates_intro, brand_canteen_intro, brand_passes_intro, brand_band_title, brand_band_text, brand_footer';

/** What the form holds: every box is always filled (with the standard wording until the shop changes it). */
export interface BrandForm {
  shop_name: string;
  tagline: string;
  hero_text: string;
  features: { title: string; text: string }[];
  studio_title: string;
  studio_text: string;
  checks: string[];
  rates_intro: string;
  canteen_intro: string;
  passes_intro: string;
  band_title: string;
  band_text: string;
  footer: string;
}

/** A text the shop left as the standard (or emptied) is stored as null, so "standard" stays standard. */
export function textColumn(value: string, standard: string): string | null {
  const v = value.trim();
  return v === '' || v === standard ? null : v;
}

/** A list the shop left as the standard (or emptied) is stored as null. Lines without a title (or text) are dropped. */
export function listColumn<T>(items: T[], standard: T[], keep: (t: T) => boolean): T[] | null {
  const kept = items.filter(keep);
  return kept.length === 0 || JSON.stringify(kept) === JSON.stringify(standard) ? null : kept;
}

/** Turns the saved settings row into what the form shows (saved wording where there is some, standard wording elsewhere). */
export function brandFromRow(row: Record<string, unknown> | null): Brand {
  const r = row ?? {};
  return mergeBrand({
    shop_name: r['shop_name'],
    tagline: r['brand_tagline'],
    hero_text: r['brand_hero_text'],
    features: r['brand_features'],
    studio_title: r['brand_studio_title'],
    studio_text: r['brand_studio_text'],
    checks: r['brand_checks'],
    rates_intro: r['brand_rates_intro'],
    canteen_intro: r['brand_canteen_intro'],
    passes_intro: r['brand_passes_intro'],
    band_title: r['brand_band_title'],
    band_text: r['brand_band_text'],
    footer: r['brand_footer'],
  });
}

@Component({
  selector: 'app-branding',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <h1 class="text-xl font-semibold">Branding &amp; home page wording</h1>
      <p class="mt-1 max-w-2xl text-sm text-slate-400">
        These are the words on your public home page, exactly as customers see them now. Change any box and press Save.
        <code>{{ '{shop}' }}</code> becomes your shop name and <code>{{ '{hours}' }}</code> the cancel-before hours. In the studio heading,
        put <code>*stars*</code> around a word to make it glow. <a href="/book" target="_blank" rel="noopener" class="underline hover:text-slate-200" data-open-home>Open the home page</a>
        to check.
      </p>

      @if (!loaded()) {
        <p class="mt-3 text-slate-400">Loading…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" class="mt-4 max-w-2xl space-y-4" data-branding-form>
          <div class="card space-y-3">
            <h2 class="font-medium">Shop name</h2>
            <label class="label">Name (on the logo, login screens, browser tab and the big heading)
              <input formControlName="shop_name" class="field" maxlength="80" data-brand-shop />
              <app-field-error [control]="form.controls.shop_name" />
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Welcome</h2>
            <label class="label">Tagline (words separated by | )
              <input formControlName="tagline" class="field" maxlength="120" data-brand-tagline />
            </label>
            <label class="label">Welcome paragraph
              <textarea formControlName="hero_text" rows="3" class="field" maxlength="400" data-brand-hero></textarea>
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Four highlights under the welcome</h2>
            <div formArrayName="features" class="space-y-3">
              @for (g of features.controls; track $index; let i = $index) {
                <div [formGroupName]="i" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input formControlName="title" class="field" maxlength="40" [attr.data-brand-feature-title]="i" [attr.aria-label]="'Highlight ' + (i + 1) + ' title'" />
                  <input formControlName="text" class="field" maxlength="80" [attr.data-brand-feature-text]="i" [attr.aria-label]="'Highlight ' + (i + 1) + ' line'" />
                </div>
              }
            </div>
            <p class="text-xs text-slate-400">A highlight with an empty title is not shown. The icons stay the same.</p>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">The studio</h2>
            <label class="label">Heading
              <input formControlName="studio_title" class="field" maxlength="120" data-brand-studio-title />
            </label>
            <label class="label">Paragraph
              <textarea formControlName="studio_text" rows="3" class="field" maxlength="500" data-brand-studio-text></textarea>
            </label>
            <p class="text-sm font-medium text-slate-200">Check-list (up to 4 lines)</p>
            <div formArrayName="checks" class="space-y-2">
              @for (c of checks.controls; track $index; let i = $index) {
                <input [formControlName]="i" class="field" maxlength="80" [attr.data-brand-check]="i" [attr.aria-label]="'Check-list line ' + (i + 1)" />
              }
            </div>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Section introductions</h2>
            <label class="label">Rates
              <input formControlName="rates_intro" class="field" maxlength="200" data-brand-rates />
            </label>
            <label class="label">Canteen
              <input formControlName="canteen_intro" class="field" maxlength="200" data-brand-canteen />
            </label>
            <label class="label">Passes
              <input formControlName="passes_intro" class="field" maxlength="200" data-brand-passes />
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Closing band and footer</h2>
            <label class="label">Band heading
              <input formControlName="band_title" class="field" maxlength="100" data-brand-band-title />
            </label>
            <label class="label">Band line
              <input formControlName="band_text" class="field" maxlength="200" data-brand-band-text />
            </label>
            <label class="label">Footer line
              <input formControlName="footer" class="field" maxlength="120" data-brand-footer />
            </label>
          </div>

          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn-primary" [disabled]="busy()" data-brand-save>{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn-outline" (click)="useStandard()" data-brand-standard>Put back the standard wording</button>
          </div>
          <p class="text-xs text-slate-400">"Put back the standard wording" fills every box with the original text. Nothing changes until you press Save.</p>
        </form>
      }
    </section>
  `,
})
export class BrandingAdmin implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly branding = inject(BrandingService);

  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    shop_name: ['', [Validators.required, notBlank, Validators.maxLength(80)]],
    tagline: ['', [Validators.maxLength(120)]],
    hero_text: ['', [Validators.maxLength(400)]],
    features: this.fb.array([0, 1, 2, 3].map(() => this.fb.nonNullable.group({ title: ['', Validators.maxLength(40)], text: ['', Validators.maxLength(80)] }))),
    studio_title: ['', [Validators.maxLength(120)]],
    studio_text: ['', [Validators.maxLength(500)]],
    checks: this.fb.array([0, 1, 2, 3].map(() => this.fb.nonNullable.control('', Validators.maxLength(80)))),
    rates_intro: ['', [Validators.maxLength(200)]],
    canteen_intro: ['', [Validators.maxLength(200)]],
    passes_intro: ['', [Validators.maxLength(200)]],
    band_title: ['', [Validators.maxLength(100)]],
    band_text: ['', [Validators.maxLength(200)]],
    footer: ['', [Validators.maxLength(120)]],
  });

  protected get features(): FormArray {
    return this.form.controls.features as unknown as FormArray;
  }
  protected get checks(): FormArray {
    return this.form.controls.checks as unknown as FormArray;
  }

  async ngOnInit(): Promise<void> {
    const { data, error } = await this.sb.from('settings').select(COLUMNS).maybeSingle();
    if (error) {
      this.toast.error(friendlyError(error));
      return;
    }
    this.fill(brandFromRow(data as Record<string, unknown> | null));
    this.loaded.set(true);
  }

  /** Puts a wording into the boxes (four rows for the highlights and the check-list, the spare ones empty). */
  private fill(b: Brand, keepName = false): void {
    const name = keepName ? this.form.controls.shop_name.value : b.shop_name;
    this.form.patchValue({
      shop_name: name,
      tagline: b.tagline,
      hero_text: b.hero_text,
      features: [0, 1, 2, 3].map((i) => ({ title: b.features[i]?.title ?? '', text: b.features[i]?.text ?? '' })),
      studio_title: b.studio_title,
      studio_text: b.studio_text,
      checks: [0, 1, 2, 3].map((i) => b.checks[i] ?? ''),
      rates_intro: b.rates_intro,
      canteen_intro: b.canteen_intro,
      passes_intro: b.passes_intro,
      band_title: b.band_title,
      band_text: b.band_text,
      footer: b.footer,
    });
  }

  /** Fills the boxes with the original wording (the shop name is kept). Saved only when the person presses Save. */
  protected useStandard(): void {
    this.fill({ ...DEFAULT_BRAND }, true);
    this.form.markAsDirty();
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue() as unknown as BrandForm;
    const D = DEFAULT_BRAND;
    this.busy.set(true);
    const { data, error } = await this.sb
      .from('settings')
      .update({
        shop_name: v.shop_name.trim(),
        brand_tagline: textColumn(v.tagline, D.tagline),
        brand_hero_text: textColumn(v.hero_text, D.hero_text),
        brand_features: listColumn(
          v.features.map((f) => ({ title: f.title.trim(), text: f.text.trim() })),
          D.features,
          (f) => f.title !== '',
        ),
        brand_studio_title: textColumn(v.studio_title, D.studio_title),
        brand_studio_text: textColumn(v.studio_text, D.studio_text),
        brand_checks: listColumn(v.checks.map((c) => c.trim()), D.checks, (c) => c !== ''),
        brand_rates_intro: textColumn(v.rates_intro, D.rates_intro),
        brand_canteen_intro: textColumn(v.canteen_intro, D.canteen_intro),
        brand_passes_intro: textColumn(v.passes_intro, D.passes_intro),
        brand_band_title: textColumn(v.band_title, D.band_title),
        brand_band_text: textColumn(v.band_text, D.band_text),
        brand_footer: textColumn(v.footer, D.footer),
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
      .select('id');
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    if (!data?.length) return this.toast.error('Not allowed');
    this.form.markAsPristine();
    void this.branding.refresh(); // the logo, home page and browser tab switch to the new wording at once
    this.toast.success('Wording saved');
  }
}
