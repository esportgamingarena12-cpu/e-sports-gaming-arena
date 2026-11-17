import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { countdownText, releaseLabel } from '../../book/games';
import { typeLabel } from '../../book/portal';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import {
  extensionFor,
  FOOD_IMAGE_TYPES,
  foodImagePath,
  GAME_BUCKET,
  shrinkImage,
  validateFoodImage,
} from '../../shared/food-image';
import { GamePoster } from '../../shared/game-poster';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank } from '../../shared/validators';
import { scrollToForm } from '../../shared/scroll-to-form';

interface Game {
  id: number;
  title: string;
  station_type: string | null;
  status: 'available' | 'upcoming';
  hot: boolean;
  is_new: boolean;
  release_date: string | null;
  note: string | null;
  image_path: string | null;
  sort_order: number;
  active: boolean;
}

@Component({
  selector: 'app-games-admin',
  imports: [ReactiveFormsModule, FieldError, GamePoster],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="page-title">Games</h1>
          <p class="text-sm text-slate-400">The games on the home page, and the ones coming soon (they scroll in the ticker at the top).</p>
        </div>
        <button type="button" class="btn-primary shrink-0" (click)="startNew()" data-new>+ Game</button>
      </div>

      @if (editingId() !== null) {
        <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 max-w-xl space-y-3" data-form>
          <h2 class="font-medium">{{ editingId() === 0 ? 'New game' : 'Edit game' }}</h2>

          <div class="flex items-center gap-3" data-photo>
            @if (preview(); as u) {
              <img [src]="u" alt="New poster" class="h-28 w-20 shrink-0 rounded-lg object-cover" data-preview />
            } @else {
              <app-game-poster class="h-28 w-20 shrink-0 rounded-lg" [path]="removeImage() ? null : currentPath()" [title]="form.controls.title.value" />
            }
            <div class="min-w-0 space-y-1.5">
              <label class="btn-outline inline-flex cursor-pointer items-center">
                {{ preview() || (currentPath() && !removeImage()) ? 'Change poster' : 'Add poster' }}
                <input type="file" class="sr-only" [accept]="accept" (change)="pick($event)" data-file />
              </label>
              @if (preview() || (currentPath() && !removeImage())) {
                <button type="button" class="btn ml-2 text-red-300" (click)="clearPhoto()" data-remove-photo>Remove</button>
              }
              <p class="text-xs text-slate-400">Optional. JPG, PNG or WebP; tall posters look best. Without one the game shows a coloured tile.</p>
              @if (photoError()) { <p class="text-xs text-red-400" role="alert" data-photo-error>{{ photoError() }}</p> }
            </div>
          </div>

          <label class="label">Title
            <input formControlName="title" class="field" data-title />
            <app-field-error [control]="form.controls.title" />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="label">Played on
              <select formControlName="station_type" class="field" data-platform>
                <option value="">All games</option>
                @for (t of types(); track t) { <option [value]="t">{{ label(t) }} only</option> }
              </select>
            </label>
            <label class="label">Status
              <select formControlName="status" class="field" data-status>
                <option value="available">Available now</option>
                <option value="upcoming">Coming soon</option>
              </select>
            </label>
          </div>

          @if (form.controls.status.value === 'upcoming') {
            <div class="grid grid-cols-2 gap-3">
              <label class="label">Release date (optional)
                <input formControlName="release_date" type="date" class="field" data-release />
              </label>
              <label class="label">Note (optional)
                <input formControlName="note" class="field" placeholder="e.g. Coming soon" data-note />
              </label>
            </div>
            <p class="text-xs text-slate-400">With a date the ticker shows it and a countdown; without one it shows your note, or "Coming soon".</p>
          } @else {
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="hot" data-hot /> Hot (listed first, with a HOT badge)</label>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="is_new" data-isnew /> New (NEW badge, and it appears in the ticker)</label>
            </div>
          }

          <label class="label">Order (lower shows first)
            <input formControlName="sort_order" type="number" inputmode="numeric" class="field" />
            <app-field-error [control]="form.controls.sort_order" />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="active" /> Show on the home page
          </label>

          @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

          @if (confirmDelete()) {
            <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm" data-delete-confirm>
              <p>Delete <b>{{ form.controls.title.value }}</b> from the list?</p>
              <div class="mt-2 flex gap-2">
                <button type="button" class="btn-danger" [disabled]="busy()" (click)="remove()" data-delete-yes>Yes, delete</button>
                <button type="button" class="btn" (click)="confirmDelete.set(false)">Keep</button>
              </div>
            </div>
          }

          <div class="flex flex-wrap gap-2">
            <button type="submit" class="btn-primary" [disabled]="busy()" data-save>{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn" (click)="cancel()">Cancel</button>
            @if (editingId() !== 0 && !confirmDelete()) {
              <button type="button" class="btn ml-auto text-red-300" (click)="confirmDelete.set(true)" data-delete>Delete</button>
            }
          </div>
        </form>
      }

      @for (group of groups(); track group.title) {
        <h2 class="mt-6 font-display text-lg font-bold tracking-wide text-slate-200">{{ group.title }}</h2>
        <ul class="mt-2 space-y-2" [attr.data-list]="group.key">
          @for (g of group.games; track g.id) {
            <li class="card flex flex-wrap items-center gap-3" [attr.data-game]="g.title">
              <app-game-poster class="h-16 w-12 shrink-0 rounded-lg" [class.opacity-50]="!g.active" [path]="g.image_path" [title]="g.title" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ g.title }}</p>
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                  <span>{{ g.station_type ? label(g.station_type) : 'All games' }}</span>
                  @if (g.hot) { <span class="badge bg-orange-500/20 text-orange-300">HOT</span> }
                  @if (g.is_new) { <span class="badge bg-emerald-500/20 text-emerald-300">NEW</span> }
                  @if (g.status === 'upcoming') {
                    <span>{{ whenText(g) }}</span>
                  }
                  @if (!g.active) { <span>· hidden</span> }
                  @if (!g.image_path) { <span class="text-slate-500" data-no-poster>· no poster yet</span> }
                </p>
              </div>
              <label class="btn-outline hidden cursor-pointer items-center sm:inline-flex" [class.opacity-60]="posterBusy() === g.id" data-poster-button>
                {{ posterBusy() === g.id ? 'Uploading…' : g.image_path ? 'Change poster' : 'Add poster' }}
                <input type="file" class="sr-only" [accept]="accept" [disabled]="posterBusy() !== null" (change)="quickPoster(g, $event)" data-quick-file />
              </label>
              <button type="button" class="btn" (click)="edit(g)" data-edit>Edit</button>
              <div class="flex w-full flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                <button type="button" class="btn-outline !px-3 !py-1 !text-sm" (click)="toggleActive(g)" data-toggle-active>
                  {{ g.active ? 'Make inactive' : 'Make active' }}
                </button>
                @if (rowDelete() === g.id) {
                  <span class="text-sm text-red-300">Delete {{ g.title }}?</span>
                  <button type="button" class="btn-danger !px-3 !py-1 !text-sm" (click)="removeRow(g)" data-row-delete-yes>Yes, delete</button>
                  <button type="button" class="btn !px-3 !py-1 !text-sm" (click)="rowDelete.set(null)">Keep</button>
                } @else {
                  <button type="button" class="btn ml-auto !px-3 !py-1 !text-sm text-red-300" (click)="rowDelete.set(g.id)" data-row-delete>Delete</button>
                }
              </div>
            </li>
          }
        </ul>
      }
      @if (games().length === 0 && loaded()) { <p class="mt-4 text-slate-400">No games yet. Add the first one.</p> }
    </section>
  `,
})
export class GamesAdmin implements OnInit, OnDestroy {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly accept = FOOD_IMAGE_TYPES.join(',');
  protected readonly label = typeLabel;
  protected readonly games = signal<Game[]>([]);
  protected readonly types = signal<string[]>([]);
  protected readonly loaded = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  /** the game whose delete is waiting for a yes, in the list */
  protected readonly rowDelete = signal<number | null>(null);
  /** the game whose poster is being uploaded straight from the list */
  protected readonly posterBusy = signal<number | null>(null);

  protected readonly currentPath = signal<string | null>(null);
  private pending: { blob: Blob; type: string } | null = null;
  protected readonly preview = signal<string | null>(null);
  protected readonly removeImage = signal(false);
  protected readonly photoError = signal<string | null>(null);

  /** Available games first, then the ones coming soon. */
  protected readonly groups = computed(() => {
    const now = this.games().filter((g) => g.status === 'available');
    const soon = this.games().filter((g) => g.status === 'upcoming');
    return [
      { key: 'available', title: 'Available now', games: now },
      { key: 'upcoming', title: 'Coming soon', games: soon },
    ].filter((g) => g.games.length > 0);
  });

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, notBlank]],
    station_type: [''],
    status: ['available' as 'available' | 'upcoming'],
    hot: [false],
    is_new: [false],
    release_date: [''],
    note: [''],
    sort_order: [0, [Validators.required, integer]],
    active: [true],
  });

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.dropPreview();
  }

  protected whenText(g: Game): string {
    const d = releaseLabel(g.release_date);
    const left = countdownText(g.release_date, Date.now());
    if (d) return left ? `${d} · ${left}` : d;
    return g.note || 'Coming soon';
  }

  private async load(): Promise<void> {
    const [gm, st] = await Promise.all([
      this.sb
        .from('games')
        .select('id, title, station_type, status, hot, is_new, release_date, note, image_path, sort_order, active')
        .order('sort_order')
        .order('title'),
      this.sb.from('stations').select('type'),
    ]);
    if (gm.error) return this.toast.error(friendlyError(gm.error));
    this.games.set((gm.data ?? []) as Game[]);
    this.types.set([...new Set((st.data ?? []).map((s) => s.type as string))].sort());
    this.loaded.set(true);
  }

  private resetPhoto(path: string | null): void {
    this.dropPreview();
    this.pending = null;
    this.currentPath.set(path);
    this.removeImage.set(false);
    this.photoError.set(null);
    this.confirmDelete.set(false);
    this.error.set(null);
  }

  private dropPreview(): void {
    const u = this.preview();
    if (u) URL.revokeObjectURL(u);
    this.preview.set(null);
  }

  protected startNew(): void {
    this.form.reset({ title: '', station_type: '', status: 'available', hot: false, is_new: false, release_date: '', note: '', sort_order: this.games().length + 1, active: true });
    this.resetPhoto(null);
    this.editingId.set(0);
    scrollToForm();
  }

  protected edit(g: Game): void {
    this.form.reset({
      title: g.title,
      station_type: g.station_type ?? '',
      status: g.status,
      hot: g.hot,
      is_new: g.is_new,
      release_date: g.release_date ?? '',
      note: g.note ?? '',
      sort_order: g.sort_order,
      active: g.active,
    });
    this.resetPhoto(g.image_path);
    this.editingId.set(g.id);
    scrollToForm();
  }

  protected cancel(): void {
    this.resetPhoto(null);
    this.editingId.set(null);
  }

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoError.set(null);
    if (!FOOD_IMAGE_TYPES.includes(file.type)) {
      this.photoError.set(validateFoodImage(file));
      return;
    }
    let blob: Blob = file;
    try {
      blob = await shrinkImage(file, 1000);
    } catch {
      blob = file;
    }
    const problem = validateFoodImage({ type: blob.type || file.type, size: blob.size });
    if (problem) {
      this.photoError.set(problem);
      return;
    }
    this.dropPreview();
    this.pending = { blob, type: blob.type || file.type };
    this.preview.set(URL.createObjectURL(blob));
    this.removeImage.set(false);
  }

  protected clearPhoto(): void {
    this.dropPreview();
    this.pending = null;
    this.removeImage.set(true);
    this.photoError.set(null);
  }

  /** Add or change a poster straight from the list, without opening the form. */
  protected async quickPoster(g: Game, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!FOOD_IMAGE_TYPES.includes(file.type)) return this.toast.error(validateFoodImage(file) ?? 'Use a JPG, PNG or WebP poster');
    this.posterBusy.set(g.id);
    let blob: Blob = file;
    try {
      blob = await shrinkImage(file, 1000);
    } catch {
      blob = file;
    }
    const type = blob.type || file.type;
    const problem = validateFoodImage({ type, size: blob.size });
    if (problem) {
      this.posterBusy.set(null);
      return this.toast.error(problem);
    }
    const path = foodImagePath(g.title, extensionFor(type));
    const up = await this.sb.storage.from(GAME_BUCKET).upload(path, blob, { contentType: type, upsert: false });
    if (up.error) {
      this.posterBusy.set(null);
      return this.toast.error(`The poster could not be saved: ${friendlyError(up.error)}`);
    }
    const saved = await this.sb.from('games').update({ image_path: path }).eq('id', g.id).select('id');
    this.posterBusy.set(null);
    if (saved.error || !saved.data?.length) {
      await this.deleteFile(path);
      return this.toast.error(saved.error ? friendlyError(saved.error) : 'Not allowed');
    }
    if (g.image_path) await this.deleteFile(g.image_path);
    this.toast.success(`Poster saved for ${g.title}`);
    await this.load();
  }

  private async deleteFile(path: string | null): Promise<void> {
    if (path) await this.sb.storage.from(GAME_BUCKET).remove([path]); // best effort: a leftover file is harmless
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const id = this.editingId();
    const oldPath = id === 0 ? null : this.currentPath();
    this.busy.set(true);
    this.error.set(null);

    let imagePath: string | null = this.removeImage() ? null : oldPath;
    let uploaded: string | null = null;
    if (this.pending) {
      const path = foodImagePath(v.title, extensionFor(this.pending.type));
      const up = await this.sb.storage.from(GAME_BUCKET).upload(path, this.pending.blob, { contentType: this.pending.type, upsert: false });
      if (up.error) {
        this.busy.set(false);
        this.error.set(`The poster could not be saved: ${friendlyError(up.error)}`);
        return;
      }
      uploaded = path;
      imagePath = path;
    }

    const upcoming = v.status === 'upcoming';
    const row = {
      title: v.title.trim(),
      station_type: v.station_type || null,
      status: v.status,
      hot: upcoming ? false : v.hot,
      is_new: upcoming ? false : v.is_new,
      release_date: upcoming && v.release_date ? v.release_date : null,
      note: upcoming && v.note.trim() ? v.note.trim() : null,
      image_path: imagePath,
      sort_order: Number(v.sort_order),
      active: v.active,
    };
    const result =
      id === 0
        ? await this.sb.from('games').insert(row).select('id')
        : await this.sb.from('games').update(row).eq('id', id).select('id');
    this.busy.set(false);
    if (result.error || !result.data?.length) {
      await this.deleteFile(uploaded);
      this.error.set(result.error ? friendlyError(result.error) : 'Not allowed');
      return;
    }
    if (oldPath && oldPath !== imagePath) await this.deleteFile(oldPath);
    this.toast.success(id === 0 ? 'Game added' : 'Game saved');
    this.cancel();
    await this.load();
  }

  protected async toggleActive(g: Game): Promise<void> {
    const { data, error } = await this.sb.from('games').update({ active: !g.active }).eq('id', g.id).select('id');
    if (error || !data?.length) return this.toast.error(error ? friendlyError(error) : 'Not allowed');
    this.toast.success(`${g.title} is now ${g.active ? 'inactive (hidden from the home page)' : 'active'}`);
    await this.load();
  }

  protected async removeRow(g: Game): Promise<void> {
    const { data, error } = await this.sb.from('games').delete().eq('id', g.id).select('id');
    this.rowDelete.set(null);
    if (error || !data?.length) return this.toast.error(error ? friendlyError(error) : 'Not allowed');
    await this.deleteFile(g.image_path);
    this.toast.success('Game deleted');
    await this.load();
  }

  protected async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    const photo = this.currentPath();
    this.busy.set(true);
    const { error } = await this.sb.from('games').delete().eq('id', id);
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    await this.deleteFile(photo);
    this.toast.success('Game deleted');
    this.cancel();
    await this.load();
  }
}
