import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '../../core/branding';
import { brandFromRow, listColumn, textColumn } from './branding';

describe('textColumn', () => {
  it('stores nothing when the text is the standard, empty, or only spaces', () => {
    expect(textColumn(DEFAULT_BRAND.tagline, DEFAULT_BRAND.tagline)).toBeNull();
    expect(textColumn('  ' + DEFAULT_BRAND.tagline + ' ', DEFAULT_BRAND.tagline)).toBeNull();
    expect(textColumn('', DEFAULT_BRAND.tagline)).toBeNull();
    expect(textColumn('   ', DEFAULT_BRAND.tagline)).toBeNull();
  });
  it('stores the shop\'s own text, trimmed', () => {
    expect(textColumn('  Game | Win ', DEFAULT_BRAND.tagline)).toBe('Game | Win');
  });
});

describe('listColumn', () => {
  const keep = (f: { title: string }) => f.title !== '';
  it('stores nothing for the standard list or an empty one', () => {
    expect(listColumn(DEFAULT_BRAND.features, DEFAULT_BRAND.features, keep)).toBeNull();
    expect(listColumn([{ title: '', text: 'x' }], DEFAULT_BRAND.features, keep)).toBeNull();
    expect(listColumn(['a', ''], DEFAULT_BRAND.checks, (c) => c !== '')).toEqual(['a']);
  });
  it('drops rows without a title and keeps the rest in order', () => {
    const rows = [{ title: 'One', text: 'a' }, { title: '', text: 'gone' }, { title: 'Two', text: 'b' }];
    expect(listColumn(rows, DEFAULT_BRAND.features, keep)).toEqual([{ title: 'One', text: 'a' }, { title: 'Two', text: 'b' }]);
  });
});

describe('brandFromRow', () => {
  it('shows the standard wording for a row with nothing saved, with the saved shop name', () => {
    const b = brandFromRow({ shop_name: 'Pixel Zone', brand_tagline: null, brand_features: null });
    expect(b.shop_name).toBe('Pixel Zone');
    expect(b.tagline).toBe(DEFAULT_BRAND.tagline);
    expect(b.features).toEqual(DEFAULT_BRAND.features);
    expect(b.checks).toEqual(DEFAULT_BRAND.checks);
  });
  it('shows what the shop saved and the standard wording for the rest', () => {
    const b = brandFromRow({ shop_name: 'X', brand_tagline: 'Game | Win', brand_checks: ['one'] });
    expect(b.tagline).toBe('Game | Win');
    expect(b.checks).toEqual(['one']);
    expect(b.hero_text).toBe(DEFAULT_BRAND.hero_text);
  });
  it('copes with no row at all', () => {
    expect(brandFromRow(null)).toEqual(DEFAULT_BRAND);
  });
});
