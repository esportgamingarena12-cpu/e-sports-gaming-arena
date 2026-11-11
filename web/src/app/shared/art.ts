import { Component } from '@angular/core';

/*
 * Neon illustrations drawn in code (SVG), in the brand palette. They scale to any size, add no image files and
 * work offline. To use real photos instead, put them in web/public/images and swap the component for an <img>.
 */

/** The hero picture: a gamer at a triple-monitor desk under neon light. */
@Component({
  selector: 'app-hero-art',
  template: `
    <svg viewBox="0 0 560 420" class="h-auto w-full" role="img" aria-label="A gamer at a neon desk with three monitors">
      <defs>
        <radialGradient id="ha-glow" cx="55%" cy="40%" r="60%">
          <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.55" /><stop offset="1" stop-color="#8b5cf6" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ha-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7c3aed" /><stop offset="0.55" stop-color="#2563eb" /><stop offset="1" stop-color="#00d9ff" />
        </linearGradient>
        <linearGradient id="ha-screen2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff6b35" /><stop offset="1" stop-color="#8b5cf6" />
        </linearGradient>
        <linearGradient id="ha-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1d1a3d" /><stop offset="1" stop-color="#0d0b1f" />
        </linearGradient>
        <filter id="ha-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      <ellipse cx="300" cy="190" rx="270" ry="190" fill="url(#ha-glow)" />
      <!-- floor grid -->
      <g stroke="#8b5cf6" stroke-opacity="0.28" stroke-width="1">
        <path d="M0 330 L560 330 M0 352 L560 352 M0 380 L560 380 M0 414 L560 414" />
        <path d="M280 318 L40 420 M280 318 L140 420 M280 318 L280 420 M280 318 L420 420 M280 318 L520 420" />
      </g>

      <!-- monitors -->
      <g>
        <g transform="rotate(-6 120 210)">
          <rect x="52" y="140" width="150" height="100" rx="8" fill="#0b0b14" stroke="#8b5cf6" stroke-width="3" />
          <rect x="60" y="148" width="134" height="84" rx="4" fill="url(#ha-screen)" />
          <path d="M70 215 L95 185 L115 200 L140 165 L185 205 L185 225 L70 225Z" fill="#0b0b14" fill-opacity="0.35" />
        </g>
        <g>
          <rect x="190" y="105" width="190" height="125" rx="9" fill="#0b0b14" stroke="#00d9ff" stroke-width="3" />
          <rect x="199" y="114" width="172" height="107" rx="5" fill="url(#ha-screen)" />
          <circle cx="285" cy="166" r="26" fill="#0b0b14" fill-opacity="0.35" /><circle cx="285" cy="166" r="14" fill="#00d9ff" fill-opacity="0.85" />
          <rect x="210" y="124" width="52" height="6" rx="3" fill="#fff" fill-opacity="0.7" />
          <rect x="210" y="204" width="90" height="6" rx="3" fill="#fff" fill-opacity="0.45" />
          <rect x="276" y="230" width="18" height="30" fill="#17152b" />
        </g>
        <g transform="rotate(6 440 210)">
          <rect x="368" y="140" width="150" height="100" rx="8" fill="#0b0b14" stroke="#ff6b35" stroke-width="3" />
          <rect x="376" y="148" width="134" height="84" rx="4" fill="url(#ha-screen2)" />
          <rect x="388" y="160" width="60" height="6" rx="3" fill="#fff" fill-opacity="0.65" />
          <rect x="388" y="176" width="100" height="40" rx="4" fill="#0b0b14" fill-opacity="0.3" />
        </g>
      </g>

      <!-- desk -->
      <rect x="30" y="256" width="500" height="16" rx="8" fill="#17152b" stroke="#8b5cf6" stroke-opacity="0.7" />
      <rect x="40" y="272" width="480" height="4" rx="2" fill="#00d9ff" filter="url(#ha-blur)" />
      <rect x="40" y="272" width="480" height="3" rx="1.5" fill="#00d9ff" />
      <rect x="205" y="236" width="150" height="14" rx="6" fill="#0b0b14" stroke="#8b5cf6" stroke-opacity="0.6" />

      <!-- chair -->
      <rect x="236" y="178" width="140" height="190" rx="46" fill="url(#ha-body)" stroke="#8b5cf6" stroke-width="2.5" />
      <rect x="258" y="196" width="96" height="150" rx="34" fill="#0b0b14" fill-opacity="0.55" />
      <rect x="303" y="196" width="6" height="150" fill="#8b5cf6" fill-opacity="0.6" />

      <!-- gamer, seen from behind -->
      <path d="M232 340 C226 286 252 262 306 262 C360 262 386 286 380 340 Z" fill="#14122b" stroke="#00d9ff" stroke-opacity="0.65" stroke-width="2" />
      <circle cx="306" cy="220" r="40" fill="#14122b" stroke="#00d9ff" stroke-opacity="0.65" stroke-width="2" />
      <path d="M262 220 C262 176 350 176 350 220" fill="none" stroke="#8b5cf6" stroke-width="9" stroke-linecap="round" />
      <rect x="250" y="206" width="20" height="38" rx="9" fill="#8b5cf6" stroke="#00d9ff" stroke-width="2" />
      <rect x="342" y="206" width="20" height="38" rx="9" fill="#8b5cf6" stroke="#00d9ff" stroke-width="2" />
      <path d="M254 232 C246 260 270 268 286 262" fill="none" stroke="#00d9ff" stroke-width="3" stroke-linecap="round" />
      <path d="M262 200 C282 186 326 186 350 200" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="6" stroke-linecap="round" />

      <!-- floating controller -->
      <g transform="translate(430 28) rotate(14)" filter="url(#ha-blur)" opacity="0.8">
        <path d="M20 14h60c14 0 22 12 25 30l3 14c3 12-9 18-18 11l-13-11H33L20 69c-9 7-21 1-18-11l3-14C8 26 16 14 30 14z" fill="#8b5cf6" />
      </g>
      <g transform="translate(430 28) rotate(14)" fill="none" stroke="#c4b5fd" stroke-width="3.5" stroke-linejoin="round">
        <path d="M20 14h60c14 0 22 12 25 30l3 14c3 12-9 18-18 11l-13-11H33L20 69c-9 7-21 1-18-11l3-14C8 26 16 14 30 14z" />
        <path d="M30 34h14M37 27v14" stroke-linecap="round" />
        <circle cx="70" cy="30" r="3.5" fill="#c4b5fd" /><circle cx="80" cy="40" r="3.5" fill="#c4b5fd" />
      </g>

      <!-- sparkles -->
      <g fill="#00d9ff"><circle cx="70" cy="90" r="3" /><circle cx="520" cy="110" r="2.5" /><circle cx="150" cy="60" r="2" /></g>
      <g fill="#ff6b35"><circle cx="500" cy="300" r="3" /><circle cx="60" cy="290" r="2.5" /></g>
    </svg>
  `,
})
export class HeroArt {}

/** A gaming room: rows of glowing PCs, chairs and a neon sign. */
@Component({
  selector: 'app-room-art',
  template: `
    <svg viewBox="0 0 520 310" class="h-auto w-full" role="img" aria-label="A neon gaming room with rows of PCs">
      <defs>
        <linearGradient id="ra-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a1d52" /><stop offset="1" stop-color="#0d0b1f" />
        </linearGradient>
        <linearGradient id="ra-scr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7c3aed" /><stop offset="1" stop-color="#00d9ff" />
        </linearGradient>
        <linearGradient id="ra-scr2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff6b35" /><stop offset="1" stop-color="#8b5cf6" />
        </linearGradient>
        <filter id="ra-blur"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <rect width="520" height="310" fill="url(#ra-wall)" />
      <!-- ceiling strips -->
      <g stroke-width="5" stroke-linecap="round">
        <path d="M40 22 L480 22" stroke="#8b5cf6" filter="url(#ra-blur)" /><path d="M40 22 L480 22" stroke="#c4b5fd" stroke-width="2" />
        <path d="M110 44 L410 44" stroke="#00d9ff" filter="url(#ra-blur)" /><path d="M110 44 L410 44" stroke="#a5f3fc" stroke-width="2" />
      </g>
      <!-- sign -->
      <g>
        <rect x="170" y="62" width="180" height="46" rx="10" fill="#0b0b14" stroke="#00d9ff" stroke-width="2.5" />
        <rect x="170" y="62" width="180" height="46" rx="10" fill="none" stroke="#00d9ff" stroke-width="6" opacity="0.35" filter="url(#ra-blur)" />
        <text x="260" y="84" text-anchor="middle" fill="#c4b5fd" font-family="Rajdhani, sans-serif" font-weight="700" font-size="19" letter-spacing="3">E-SPORT</text>
        <text x="260" y="101" text-anchor="middle" fill="#00d9ff" font-family="Rajdhani, sans-serif" font-weight="700" font-size="12" letter-spacing="5">GAMING ARENA</text>
      </g>
      <!-- floor -->
      <path d="M0 190 L520 190 L520 310 L0 310Z" fill="#0b0b14" />
      <g stroke="#8b5cf6" stroke-opacity="0.3"><path d="M0 214 H520 M0 244 H520 M0 280 H520" /><path d="M260 190 L-60 310 M260 190 L130 310 M260 190 L260 310 M260 190 L390 310 M260 190 L580 310" /></g>

      <!-- back row of desks -->
      <g>
        @for (x of backRow; track x; let i = $index) {
          <rect [attr.x]="x" y="148" width="70" height="46" rx="4" fill="#0b0b14" [attr.stroke]="i % 2 ? '#ff6b35' : '#8b5cf6'" stroke-width="2" />
          <rect [attr.x]="x + 4" y="152" width="62" height="36" rx="2" [attr.fill]="i % 2 ? 'url(#ra-scr2)' : 'url(#ra-scr)'" />
          <rect [attr.x]="x - 8" y="194" width="86" height="7" rx="3" fill="#17152b" stroke="#8b5cf6" stroke-opacity="0.5" />
          <rect [attr.x]="x + 22" y="205" width="26" height="30" rx="10" fill="#17152b" stroke="#00d9ff" stroke-opacity="0.5" />
        }
      </g>
      <!-- front row of desks -->
      <g>
        @for (x of frontRow; track x; let i = $index) {
          <rect [attr.x]="x" y="208" width="100" height="62" rx="5" fill="#0b0b14" [attr.stroke]="i % 2 ? '#00d9ff' : '#8b5cf6'" stroke-width="2.5" />
          <rect [attr.x]="x + 6" y="214" width="88" height="48" rx="3" [attr.fill]="i % 2 ? 'url(#ra-scr)' : 'url(#ra-scr2)'" />
          <rect [attr.x]="x - 10" y="270" width="120" height="9" rx="4" fill="#17152b" stroke="#8b5cf6" stroke-opacity="0.6" />
          <rect [attr.x]="x - 10" y="279" width="120" height="3" rx="1.5" fill="#00d9ff" opacity="0.8" />
        }
      </g>
    </svg>
  `,
})
export class RoomArt {
  protected readonly backRow = [28, 130, 232, 334, 420];
  protected readonly frontRow = [30, 210, 372];
}

/** A small gamer bust for the bottom of the sidebar. */
@Component({
  selector: 'app-side-art',
  template: `
    <svg viewBox="0 0 240 170" class="h-auto w-full" role="img" aria-label="Gamer with headphones">
      <defs>
        <radialGradient id="sa-glow" cx="50%" cy="60%" r="60%">
          <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.55" /><stop offset="1" stop-color="#8b5cf6" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="sa-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a1d52" /><stop offset="1" stop-color="#14122b" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="100" rx="110" ry="80" fill="url(#sa-glow)" />
      <path d="M30 170 C34 126 66 108 120 108 C174 108 206 126 210 170Z" fill="url(#sa-body)" stroke="#00d9ff" stroke-opacity="0.7" stroke-width="2" />
      <circle cx="120" cy="72" r="34" fill="#1d1a3d" stroke="#00d9ff" stroke-opacity="0.7" stroke-width="2" />
      <path d="M84 62 C90 30 150 30 156 62 L156 52 C150 24 90 24 84 52Z" fill="#8b5cf6" />
      <path d="M80 70 C78 36 162 36 160 70" fill="none" stroke="#8b5cf6" stroke-width="8" stroke-linecap="round" />
      <rect x="70" y="58" width="16" height="32" rx="8" fill="#8b5cf6" stroke="#00d9ff" stroke-width="2" />
      <rect x="154" y="58" width="16" height="32" rx="8" fill="#8b5cf6" stroke="#00d9ff" stroke-width="2" />
      <path d="M76 86 C70 106 92 112 106 106" fill="none" stroke="#00d9ff" stroke-width="3" stroke-linecap="round" />
      <circle cx="108" cy="78" r="3" fill="#00d9ff" /><circle cx="132" cy="78" r="3" fill="#00d9ff" />
      <g transform="translate(168 112) rotate(-10)" fill="none" stroke="#c4b5fd" stroke-width="2.4" stroke-linejoin="round">
        <path d="M10 8h30c8 0 13 7 14 17l2 8c2 7-5 10-10 6l-8-6H18l-8 6c-5 4-12 1-10-6l2-8C-3 15 2 8 10 8z" />
        <circle cx="38" cy="17" r="2" fill="#c4b5fd" /><circle cx="44" cy="23" r="2" fill="#c4b5fd" />
        <path d="M14 18h8M18 14v8" stroke-linecap="round" />
      </g>
    </svg>
  `,
})
export class SideArt {}
