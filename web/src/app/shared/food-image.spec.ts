import { describe, expect, it } from 'vitest';
import { extensionFor, foodImagePath, foodImageUrl, foodInitial, gameImageUrl, MAX_FOOD_IMAGE_BYTES, publicImageUrl, validateFoodImage } from './food-image';

describe('food photo address', () => {
  const base = 'https://abc.supabase.co';
  it('builds the public address of a stored photo', () => {
    expect(foodImageUrl('veg-pizza-1.jpg', base)).toBe('https://abc.supabase.co/storage/v1/object/public/food-images/veg-pizza-1.jpg');
  });
  it('ignores a trailing slash on the base and encodes odd characters', () => {
    expect(foodImageUrl('a b/c.jpg', 'https://abc.supabase.co/')).toBe('https://abc.supabase.co/storage/v1/object/public/food-images/a%20b/c.jpg');
  });
  it('is null when there is no photo', () => {
    expect(foodImageUrl(null, base)).toBeNull();
    expect(foodImageUrl(undefined, base)).toBeNull();
    expect(foodImageUrl('   ', base)).toBeNull();
  });
});

describe('food photo file name', () => {
  it('makes a readable, safe name', () => {
    expect(foodImagePath('Sweet Corn Pizza', 'jpg', 123)).toBe('sweet-corn-pizza-123.jpg');
    expect(foodImagePath('  Samosa (1 Pc)!  ', 'PNG', 5)).toBe('samosa-1-pc-5.png');
  });
  it('copes with names that have no usable letters', () => {
    expect(foodImagePath('???', 'jpg', 9)).toBe('item-9.jpg');
    expect(foodImagePath('Café Latte', '', 9)).toBe('cafe-latte-9.jpg');
  });
  it('keeps a long name short', () => {
    expect(foodImagePath('x'.repeat(100), 'jpg', 1).length).toBeLessThanOrEqual(40 + '-1.jpg'.length);
  });
  it('maps types to extensions', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/gif')).toBe('jpg');
  });
});

describe('food photo check', () => {
  it('accepts JPG, PNG and WebP up to 2 MB', () => {
    expect(validateFoodImage({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateFoodImage({ type: 'image/png', size: MAX_FOOD_IMAGE_BYTES })).toBeNull();
    expect(validateFoodImage({ type: 'image/webp', size: 5 })).toBeNull();
  });
  it('refuses other types, big files and empty files', () => {
    expect(validateFoodImage({ type: 'image/gif', size: 1000 })).toContain('JPG, PNG or WebP');
    expect(validateFoodImage({ type: 'application/pdf', size: 1000 })).toContain('JPG, PNG or WebP');
    expect(validateFoodImage({ type: 'image/jpeg', size: MAX_FOOD_IMAGE_BYTES + 1 })).toContain('2 MB');
    expect(validateFoodImage({ type: 'image/jpeg', size: 0 })).toContain('empty');
  });
});

describe('tile without a photo', () => {
  it('shows the first letter in capitals', () => {
    expect(foodInitial('samosa')).toBe('S');
    expect(foodInitial('  veg pizza')).toBe('V');
    expect(foodInitial('')).toBe('?');
  });
});

describe('game poster address', () => {
  const base = 'https://abc.supabase.co';
  it('uses the game-images bucket', () => {
    expect(gameImageUrl('gta-6-1.jpg', base)).toBe('https://abc.supabase.co/storage/v1/object/public/game-images/gta-6-1.jpg');
  });
  it('any bucket works, and no file means no address', () => {
    expect(publicImageUrl('other', 'a/b.png', base)).toBe('https://abc.supabase.co/storage/v1/object/public/other/a/b.png');
    expect(gameImageUrl(null, base)).toBeNull();
    expect(gameImageUrl('', base)).toBeNull();
  });
});
