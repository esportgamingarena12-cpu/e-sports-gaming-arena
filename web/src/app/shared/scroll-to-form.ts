/**
 * Brings the edit form into view. The admin screens show the form above the list, so pressing Edit on a row far down
 * the page would otherwise change nothing the person can see. Waits one tick so the form has been drawn, scrolls it to
 * the top (no animation for people who ask for less motion) and puts the cursor in its first field.
 */
export function scrollToForm(): void {
  setTimeout(() => {
    const form = document.querySelector('main form, form');
    if (!form) return;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    form.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    (form.querySelector('input:not([type=checkbox]):not([type=file]), select, textarea') as HTMLElement | null)?.focus({ preventScroll: true });
  }, 0);
}
