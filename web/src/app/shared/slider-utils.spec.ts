import { describe, expect, it } from 'vitest';
import { nextIndex, prevIndex, swipeDirection } from './slider-utils';

describe('slider position', () => {
  it('moves forward and wraps to the first slide', () => {
    expect(nextIndex(0, 4)).toBe(1);
    expect(nextIndex(2, 4)).toBe(3);
    expect(nextIndex(3, 4)).toBe(0);
  });
  it('moves back and wraps to the last slide', () => {
    expect(prevIndex(3, 4)).toBe(2);
    expect(prevIndex(1, 4)).toBe(0);
    expect(prevIndex(0, 4)).toBe(3);
  });
  it('stays on the only slide, and copes with none', () => {
    expect(nextIndex(0, 1)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
    expect(prevIndex(0, 0)).toBe(0);
  });
});

describe('swipe', () => {
  it('swiping left shows the next slide, right the previous', () => {
    expect(swipeDirection(-120, 5)).toBe('next');
    expect(swipeDirection(120, -5)).toBe('prev');
  });
  it('a short drag is a tap, not a swipe', () => {
    expect(swipeDirection(-49, 0)).toBeNull();
    expect(swipeDirection(30, 2)).toBeNull();
    expect(swipeDirection(-50, 0)).toBe('next');
  });
  it('a mostly vertical drag is the page scrolling', () => {
    expect(swipeDirection(-80, 120)).toBeNull();
    expect(swipeDirection(60, -70)).toBeNull();
    expect(swipeDirection(-100, 60)).toBe('next');
  });
});
