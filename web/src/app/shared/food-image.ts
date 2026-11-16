import { Component, computed, input } from '@angular/core';
import { environment } from '../../environments/environment';

/** Food photos live in the public Supabase Storage bucket "food-images"; only the admin can add or remove files. */
export const FOOD_BUCKET = 'food-images';
export const MAX_FOOD_IMAGE_BYTES = 2 * 1024 * 1024;
export const FOOD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The public address of a stored photo, or null when the item has none. */
export function foodImageUrl(path: string | null | undefined, baseUrl: string = environment.SUPABASE_URL): string | null {
  const p = (path ?? '').trim();
  if (!p) return null;
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${FOOD_BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;
}

/** A readable, URL-safe file name such as "sweet-corn-pizza-1731500000000.jpg". */
export function foodImagePath(productName: string, ext: string, stamp: number = Date.now()): string {
  const slug =
    productName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item';
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${slug}-${stamp}.${e}`;
}

/** "jpeg" for image/jpeg, "png", "webp"; anything else falls back to jpg. */
export function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

/** A message when the file cannot be used as a food photo, otherwise null. */
export function validateFoodImage(file: { type: string; size: number }): string | null {
  if (!FOOD_IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP photo';
  if (file.size > MAX_FOOD_IMAGE_BYTES) return 'The photo is larger than 2 MB';
  if (file.size === 0) return 'The photo file is empty';
  return null;
}

/** The first letter shown on the tile of an item without a photo. */
export function foodInitial(name: string): string {
  const c = (name ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

/**
 * Makes a phone photo small enough to upload quickly: at most `maxSide` pixels on the long edge, saved as JPEG.
 * Photos that are already small are returned untouched. Needs a browser (canvas); not used in unit tests.
 */
export async function shrinkImage(file: File, maxSide = 900, quality = 0.85): Promise<Blob> {
  if (file.size <= 250 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob && blob.size < file.size ? blob : file;
}

/** A food photo, or a neat coloured tile with the item's first letter when there is none. */
@Component({
  selector: 'app-food-pic',
  template: `
    @if (url(); as u) {
      <img [src]="u" [alt]="name()" loading="lazy" decoding="async" class="size-full object-cover" data-food-img />
    } @else {
      <span class="grid size-full place-items-center bg-linear-to-br from-violet-600/40 to-cyan-400/20 font-display text-3xl font-bold text-violet-100" aria-hidden="true" data-food-fallback>
        {{ initial() }}
      </span>
    }
  `,
  host: { class: 'block overflow-hidden' },
})
export class FoodPic {
  readonly path = input<string | null | undefined>(null);
  readonly name = input('');
  protected readonly url = computed(() => foodImageUrl(this.path()));
  protected readonly initial = computed(() => foodInitial(this.name()));
}
