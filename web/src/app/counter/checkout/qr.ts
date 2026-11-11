import QRCode from 'qrcode';

export interface QrMatrix {
  size: number;
  isDark: (x: number, y: number) => boolean;
}

/** The QR modules for a text (error correction M). No canvas needed, so it also runs in tests. */
export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  return { size, isDark: (x, y) => data[y * size + x] === 1 };
}

const QUIET = 4; // modules of white border required by the QR standard

/** An SVG image (as a data URL for <img src>) of the QR code, with its quiet zone. */
export function qrSvgDataUrl(text: string): string {
  const m = qrMatrix(text);
  const dim = m.size + QUIET * 2;
  let path = '';
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.isDark(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < m.size && m.isDark(x, y)) x++;
      path += `M${start + QUIET} ${y + QUIET}h${x - start}v1h-${x - start}z`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
