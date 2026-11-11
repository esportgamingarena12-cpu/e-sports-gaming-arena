import jsQR from 'jsqr';
import { buildUpiLink, cashChange, discountError, formatPaise, paidPaise, paymentStatus, toPaise } from './payments';
import { qrMatrix, qrSvgDataUrl } from './qr';

describe('payment arithmetic (paise)', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(30);
    expect(toPaise('115.00')).toBe(11500);
    expect(toPaise(null)).toBe(0);
    expect(toPaise(19.99)).toBe(1999);
  });

  it('adds the three modes', () => {
    expect(paidPaise({ cash: 115, upi: 200, card: null })).toBe(31500);
  });

  it('the worked example: 115 cash + 200 UPI matches a 315 total, 100 + 200 does not', () => {
    expect(paymentStatus(31500, paidPaise({ cash: 115, upi: 200, card: 0 }))).toEqual({ state: 'match', diffPaise: 0 });
    expect(paymentStatus(31500, paidPaise({ cash: 100, upi: 200, card: 0 }))).toEqual({ state: 'short', diffPaise: 1500 });
    expect(paymentStatus(31500, paidPaise({ cash: 120, upi: 200, card: 0 }))).toEqual({ state: 'over', diffPaise: 500 });
  });

  it('a zero total matches zero payments', () => {
    expect(paymentStatus(0, paidPaise({ cash: null, upi: null, card: null })).state).toBe('match');
  });

  it('computes cash change only when the cash received covers the cash due', () => {
    expect(cashChange(11500, 20000)).toBe(8500);
    expect(cashChange(11500, 11500)).toBe(0);
    expect(cashChange(11500, 10000)).toBeNull();
    expect(cashChange(0, 5000)).toBeNull();
  });

  it('keeps the discount between 0 and the subtotal', () => {
    expect(discountError(500, 32000)).toBeNull();
    expect(discountError(32000, 32000)).toBeNull();
    expect(discountError(32001, 32000)).toBe('Discount cannot be more than the subtotal');
    expect(discountError(-1, 32000)).toBe('Discount cannot be negative');
  });

  it('formats paise as rupees', () => {
    expect(formatPaise(31500)).toBe('₹315.00');
    expect(formatPaise(5)).toBe('₹0.05');
  });
});

describe('UPI link and QR code', () => {
  const link = buildUpiLink('egamingera@okaxis', 'E-Sports Gaming Arena', 20000);

  it('uses the format from the spec', () => {
    expect(link).toBe('upi://pay?pa=egamingera@okaxis&pn=E-Sports%20Gaming%20Arena&am=200.00&cu=INR');
  });

  it('writes the amount with two decimals', () => {
    expect(buildUpiLink('a@b', 'Shop', 12345)).toContain('am=123.45');
    expect(buildUpiLink('a@b', 'Shop', 5)).toContain('am=0.05');
  });

  it('escapes unsafe characters in the payee name', () => {
    expect(buildUpiLink('a@b', 'Tom & Jerry', 100)).toContain('pn=Tom%20%26%20Jerry');
  });

  it('the QR code decodes back to exactly the same link', () => {
    const m = qrMatrix(link);
    const scale = 4;
    const margin = 4;
    const dim = (m.size + margin * 2) * scale;
    const rgba = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (!m.isDark(x, y)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = (x + margin) * scale + dx;
            const py = (y + margin) * scale + dy;
            const i = (py * dim + px) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
          }
        }
      }
    }
    expect(jsQR(rgba, dim, dim)?.data).toBe(link);
  });

  it('produces an SVG image for the dialog', () => {
    const url = qrSvgDataUrl(link);
    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(url)).toContain('<svg');
  });
});
