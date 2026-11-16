/** Slider position rules, kept apart from the component so they can be unit tested. */

/** The slide after this one; after the last comes the first. */
export function nextIndex(index: number, count: number): number {
  return count <= 0 ? 0 : (index + 1) % count;
}

/** The slide before this one; before the first comes the last. */
export function prevIndex(index: number, count: number): number {
  return count <= 0 ? 0 : (index - 1 + count) % count;
}

/**
 * What a drag means. A swipe needs to be mostly sideways and at least `min` pixels long; a mostly vertical drag is
 * the page being scrolled and is ignored. Swiping left shows the next slide.
 */
export function swipeDirection(dx: number, dy: number, min = 50): 'next' | 'prev' | null {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return null;
  return dx < 0 ? 'next' : 'prev';
}
