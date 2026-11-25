import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND, fillBrand, fitLength, glowParts, mergeBrand, taglineParts, titleLines } from './branding';

describe('mergeBrand', () => {
  it('uses the built-in wording for nothing, null or rubbish', () => {
    expect(mergeBrand(null)).toEqual(DEFAULT_BRAND);
    expect(mergeBrand(undefined)).toEqual(DEFAULT_BRAND);
    expect(mergeBrand('x')).toEqual(DEFAULT_BRAND);
    expect(mergeBrand({ shop_name: null, tagline: '   ', features: 'no', checks: {} })).toEqual(DEFAULT_BRAND);
  });

  it('takes what the shop wrote and keeps the rest standard', () => {
    const b = mergeBrand({ shop_name: 'Pixel Zone', tagline: 'Game | Win', hero_text: null });
    expect(b.shop_name).toBe('Pixel Zone');
    expect(b.tagline).toBe('Game | Win');
    expect(b.hero_text).toBe(DEFAULT_BRAND.hero_text);
  });

  it('keeps at most 4 highlights, drops ones without a title, trims and cuts long text', () => {
    const b = mergeBrand({
      features: [
        { title: ' One ', text: ' a ' },
        { title: '', text: 'no title' },
        { title: 'Two', text: 'x'.repeat(200) },
        { title: 'Three' },
        { title: 'Four', text: 'd' },
        { title: 'Five', text: 'e' },
      ],
    });
    expect(b.features.map((f) => f.title)).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(b.features[0].text).toBe('a');
    expect(b.features[1].text.length).toBe(80);
    expect(b.features[2].text).toBe('');
  });

  it('keeps at most 4 check-list lines and ignores non-text entries', () => {
    const b = mergeBrand({ checks: ['a', '', 7, ' b ', 'c', 'd', 'e'] });
    expect(b.checks).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never lets a field grow past its limit', () => {
    expect(mergeBrand({ tagline: 'x'.repeat(500) }).tagline.length).toBe(120);
    expect(mergeBrand({ hero_text: 'x'.repeat(900) }).hero_text.length).toBe(400);
  });
});

describe('fillBrand', () => {
  it('fills {shop} and {hours}', () => {
    expect(fillBrand('© {shop}', 'Pixel Zone', null)).toBe('© Pixel Zone');
    expect(fillBrand('until {hours} h before', 'x', 3)).toBe('until 3 h before');
    expect(fillBrand('until {hours} h before', 'x', null)).toBe('until 2 h before');
  });
  it('leaves other braces and html alone (it is shown as plain text)', () => {
    expect(fillBrand('{other} <b>x</b>', 's', 1)).toBe('{other} <b>x</b>');
  });
});

describe('titleLines', () => {
  it('puts the first word on top, upper case', () => {
    expect(titleLines('E-Sports Gaming Arena')).toEqual({ top: 'E-SPORTS', main: 'GAMING ARENA' });
    expect(titleLines('  Pixel   Zone ')).toEqual({ top: 'PIXEL', main: 'ZONE' });
  });
  it('shows a one-word name on one line and copes with nothing', () => {
    expect(titleLines('Zenith')).toEqual({ top: '', main: 'ZENITH' });
    expect(titleLines('')).toEqual({ top: '', main: '' });
  });
});

describe('glowParts, taglineParts, fitLength', () => {
  it('marks *starred* words as glowing', () => {
    expect(glowParts('The Ultimate *Gaming* Studio')).toEqual([
      { t: 'The Ultimate ', glow: false },
      { t: 'Gaming', glow: true },
      { t: ' Studio', glow: false },
    ]);
    expect(glowParts('Plain')).toEqual([{ t: 'Plain', glow: false }]);
    expect(glowParts('')).toEqual([]);
  });
  it('splits the tagline at |', () => {
    expect(taglineParts('Play | Compete |  | Repeat')).toEqual(['Play', 'Compete', 'Repeat']);
  });
  it('squeezes only long sign text', () => {
    expect(fitLength('GAMING ARENA', 14, 230)).toBeNull();
    expect(fitLength('THE VERY LONG GAMING PLACE', 14, 230)).toBe(230);
  });
  it('the standard wording matches what the site always said', () => {
    expect(titleLines(DEFAULT_BRAND.shop_name)).toEqual({ top: 'E-SPORTS', main: 'GAMING ARENA' });
    expect(glowParts(DEFAULT_BRAND.studio_title).map((p) => p.t).join('')).toBe('The Ultimate Gaming Studio in Your City');
    expect(taglineParts(DEFAULT_BRAND.tagline)).toEqual(['Play', 'Compete', 'Stream', 'Repeat']);
  });
});
