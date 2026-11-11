import { Component } from '@angular/core';

/*
 * Neon illustrations drawn in code (SVG), in the brand palette. They scale to any size, add no image files and
 * work offline. To use real photos instead, put them in web/public/images and swap the component for an <img>.
 */

const CONTROLLER =
  'M62 22h116c28 0 46 22 52 58l8 52c6 34-24 52-48 30l-28-26H78l-28 26c-24 22-54 4-48-30l8-52c6-36 24-58 52-58z';

/** The hero picture: a gamer in a headset at a triple-monitor desk, lit in purple, cyan and orange. */
@Component({
  selector: 'app-hero-art',
  template: `
    <svg viewBox="0 0 720 520" class="h-auto w-full" role="img" aria-label="A gamer with headphones at a neon triple-monitor desk">
      <defs>
        <radialGradient id="ha-glow" cx="52%" cy="42%" r="62%">
          <stop offset="0" stop-color="#a855f7" stop-opacity="0.65" />
          <stop offset="0.55" stop-color="#7c3aed" stop-opacity="0.25" />
          <stop offset="1" stop-color="#7c3aed" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ha-beam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#d946ef" stop-opacity="0.55" /><stop offset="1" stop-color="#d946ef" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="ha-s1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6d28d9" /><stop offset="0.5" stop-color="#2563eb" /><stop offset="1" stop-color="#22d3ee" />
        </linearGradient>
        <linearGradient id="ha-s2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f97316" /><stop offset="0.55" stop-color="#e11d74" /><stop offset="1" stop-color="#7c3aed" />
        </linearGradient>
        <linearGradient id="ha-s3" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#0891b2" /><stop offset="1" stop-color="#a855f7" />
        </linearGradient>
        <linearGradient id="ha-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#241f4d" /><stop offset="1" stop-color="#0e0c24" />
        </linearGradient>
        <linearGradient id="ha-hood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3b2f86" /><stop offset="1" stop-color="#150f33" />
        </linearGradient>
        <linearGradient id="ha-pad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd" /><stop offset="1" stop-color="#22d3ee" /></linearGradient>
        <filter id="ha-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id="ha-blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>

      <ellipse cx="380" cy="230" rx="340" ry="230" fill="url(#ha-glow)" />
      <!-- light beams -->
      <path d="M0 0 L190 0 L420 520 L120 520Z" fill="url(#ha-beam)" opacity="0.5" />
      <path d="M520 0 L640 0 L720 300 L600 300Z" fill="url(#ha-beam)" opacity="0.28" />

      <!-- back wall frames -->
      <g fill="none" stroke-width="3" stroke-linecap="round">
        <rect x="50" y="40" width="130" height="86" rx="6" stroke="#22d3ee" opacity="0.55" />
        <rect x="60" y="50" width="110" height="66" rx="3" stroke="#22d3ee" opacity="0.25" />
        <rect x="560" y="70" width="110" height="140" rx="6" stroke="#f97316" opacity="0.5" />
        <path d="M575 100 H655 M575 125 H640 M575 150 H655 M575 175 H625" stroke="#f97316" opacity="0.28" />
      </g>

      <!-- floor grid -->
      <g stroke="#a855f7" stroke-opacity="0.35">
        <path d="M0 400 H720 M0 428 H720 M0 462 H720 M0 504 H720" />
        <path d="M360 388 L40 520 M360 388 L170 520 M360 388 L300 520 M360 388 L420 520 M360 388 L550 520 M360 388 L690 520" />
      </g>

      <!-- PC tower with RGB fans -->
      <g>
        <rect x="560" y="290" width="92" height="118" rx="10" fill="#0b0b14" stroke="#a855f7" stroke-width="2.5" />
        <rect x="568" y="298" width="76" height="102" rx="6" fill="#120f2b" />
        <circle cx="606" cy="330" r="22" fill="none" stroke="#22d3ee" stroke-width="4" filter="url(#ha-blur2)" />
        <circle cx="606" cy="330" r="22" fill="none" stroke="#22d3ee" stroke-width="2" />
        <circle cx="606" cy="330" r="6" fill="#22d3ee" />
        <circle cx="606" cy="374" r="16" fill="none" stroke="#d946ef" stroke-width="3" />
        <circle cx="606" cy="374" r="5" fill="#d946ef" />
      </g>

      <!-- monitors -->
      <g transform="rotate(-7 150 270)">
        <rect x="46" y="170" width="206" height="130" rx="9" fill="#0b0b14" stroke="#a855f7" stroke-width="3.5" />
        <rect x="55" y="179" width="188" height="112" rx="5" fill="url(#ha-s1)" />
        <path d="M65 278 L100 226 L128 252 L166 200 L233 270 L233 282 L65 282Z" fill="#0b0b14" fill-opacity="0.38" />
        <circle cx="205" cy="212" r="12" fill="#fff" fill-opacity="0.75" />
        <rect x="66" y="188" width="70" height="6" rx="3" fill="#fff" fill-opacity="0.8" />
        <rect x="66" y="199" width="46" height="5" rx="2.5" fill="#fff" fill-opacity="0.45" />
      </g>
      <g>
        <rect x="212" y="112" width="276" height="176" rx="11" fill="#0b0b14" stroke="#22d3ee" stroke-width="4" />
        <rect x="222" y="122" width="256" height="156" rx="6" fill="url(#ha-s3)" />
        <path d="M232 262 L292 190 L330 226 L384 160 L470 252 L470 268 L232 268Z" fill="#0b0b14" fill-opacity="0.35" />
        <circle cx="352" cy="196" r="34" fill="#0b0b14" fill-opacity="0.3" />
        <circle cx="352" cy="196" r="19" fill="#22d3ee" fill-opacity="0.9" />
        <rect x="234" y="132" width="74" height="7" rx="3.5" fill="#fff" fill-opacity="0.8" />
        <rect x="234" y="144" width="48" height="5" rx="2.5" fill="#fff" fill-opacity="0.45" />
        <rect x="406" y="132" width="62" height="38" rx="4" fill="#0b0b14" fill-opacity="0.45" /><path d="M412 160 L424 148 L434 156 L446 142 L462 160" fill="none" stroke="#22d3ee" stroke-width="2.5" />
        <rect x="234" y="256" width="120" height="8" rx="4" fill="#fff" fill-opacity="0.4" />
        <rect x="334" y="288" width="24" height="34" fill="#17152b" />
      </g>
      <g transform="rotate(7 570 270)">
        <rect x="468" y="170" width="206" height="130" rx="9" fill="#0b0b14" stroke="#f97316" stroke-width="3.5" />
        <rect x="477" y="179" width="188" height="112" rx="5" fill="url(#ha-s2)" />
        <rect x="489" y="192" width="86" height="7" rx="3.5" fill="#fff" fill-opacity="0.75" />
        <rect x="489" y="208" width="140" height="60" rx="5" fill="#0b0b14" fill-opacity="0.3" />
        <path d="M497 258 L520 236 L540 248 L566 220 L600 254" fill="none" stroke="#fde68a" stroke-width="3" />
      </g>

      <!-- desk -->
      <rect x="20" y="300" width="560" height="18" rx="9" fill="#17152b" stroke="#a855f7" stroke-opacity="0.8" stroke-width="2" />
      <rect x="30" y="318" width="540" height="6" rx="3" fill="#22d3ee" filter="url(#ha-blur2)" />
      <rect x="30" y="318" width="540" height="3.5" rx="1.75" fill="#67e8f9" />
      <!-- keyboard and mouse -->
      <g>
        <rect x="236" y="276" width="190" height="20" rx="5" fill="#0b0b14" stroke="#a855f7" stroke-opacity="0.8" />
        <g fill="#d946ef" opacity="0.75">
          @for (x of keys; track x) { <rect [attr.x]="x" y="280" width="9" height="4" rx="1.5" /> }
        </g>
        <g fill="#22d3ee" opacity="0.75">
          @for (x of keys; track x) { <rect [attr.x]="x" y="288" width="9" height="4" rx="1.5" /> }
        </g>
        <rect x="446" y="280" width="28" height="16" rx="8" fill="#0b0b14" stroke="#22d3ee" /><rect x="458" y="283" width="4" height="6" rx="2" fill="#22d3ee" />
      </g>

      <!-- chair -->
      <rect x="258" y="196" width="178" height="244" rx="60" fill="url(#ha-body)" stroke="#a855f7" stroke-width="3" />
      <rect x="286" y="226" width="122" height="180" rx="42" fill="#0b0b14" fill-opacity="0.55" />
      <rect x="344" y="226" width="6" height="180" fill="#a855f7" fill-opacity="0.65" />
      <rect x="298" y="176" width="100" height="40" rx="20" fill="url(#ha-body)" stroke="#d946ef" stroke-width="2.5" />

      <!-- gamer, three-quarter view from behind -->
      <path d="M262 392 C250 330 282 296 348 296 C414 296 446 330 434 392Z" fill="url(#ha-hood)" stroke="#22d3ee" stroke-opacity="0.7" stroke-width="2.5" />
      <path d="M300 306 C322 322 374 322 396 306" fill="none" stroke="#22d3ee" stroke-opacity="0.45" stroke-width="2.5" />
      <circle cx="348" cy="252" r="48" fill="#17133a" stroke="#22d3ee" stroke-opacity="0.7" stroke-width="2.5" />
      <path d="M302 244 C304 204 392 204 394 244 C392 232 304 232 302 244Z" fill="#0e0b25" />
      <path d="M296 250 C292 188 404 188 400 250" fill="none" stroke="url(#ha-pad)" stroke-width="10" stroke-linecap="round" />
      <rect x="282" y="232" width="24" height="46" rx="11" fill="#7c3aed" stroke="#22d3ee" stroke-width="2.5" />
      <rect x="390" y="232" width="24" height="46" rx="11" fill="#7c3aed" stroke="#22d3ee" stroke-width="2.5" />
      <rect x="289" y="242" width="10" height="26" rx="5" fill="#22d3ee" opacity="0.85" filter="url(#ha-blur2)" />
      <rect x="397" y="242" width="10" height="26" rx="5" fill="#22d3ee" opacity="0.85" filter="url(#ha-blur2)" />
      <path d="M288 270 C276 304 308 316 330 308" fill="none" stroke="#22d3ee" stroke-width="3.5" stroke-linecap="round" />
      <path d="M306 214 C328 198 372 198 392 214" fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="7" stroke-linecap="round" />
      <!-- arms to the keyboard -->
      <path d="M270 360 C262 322 286 300 318 292" fill="none" stroke="#2b2266" stroke-width="22" stroke-linecap="round" />
      <path d="M426 360 C434 322 410 300 378 292" fill="none" stroke="#2b2266" stroke-width="22" stroke-linecap="round" />

      <!-- floating controller -->
      <g transform="translate(560 24) scale(0.62) rotate(12)" filter="url(#ha-blur)" opacity="0.9"><path d="${CONTROLLER}" fill="#a855f7" /></g>
      <g transform="translate(560 24) scale(0.62) rotate(12)" fill="rgba(124,58,237,0.25)" stroke="url(#ha-pad)" stroke-width="7" stroke-linejoin="round">
        <path d="${CONTROLLER}" />
        <path d="M70 62h28M84 48v28" stroke-linecap="round" fill="none" />
        <circle cx="168" cy="58" r="7" fill="#22d3ee" stroke="none" /><circle cx="188" cy="78" r="7" fill="#f97316" stroke="none" />
        <circle cx="148" cy="78" r="7" fill="#d946ef" stroke="none" /><circle cx="168" cy="98" r="7" fill="#fde047" stroke="none" />
      </g>

      <!-- sparkles -->
      <g fill="#22d3ee"><circle cx="70" cy="190" r="3.5" /><circle cx="690" cy="130" r="3" /><circle cx="150" cy="130" r="2.5" /><circle cx="520" cy="60" r="2.5" /></g>
      <g fill="#f97316"><circle cx="700" cy="350" r="3.5" /><circle cx="46" cy="330" r="3" /><circle cx="250" cy="70" r="2.5" /></g>
      <g fill="#d946ef"><circle cx="620" cy="250" r="3" /><circle cx="110" cy="260" r="2.5" /></g>
    </svg>
  `,
})
export class HeroArt {
  protected readonly keys = Array.from({ length: 15 }, (_, i) => 242 + i * 12);
}

/** A gaming room: rows of glowing PCs and chairs under neon strips, with the arena sign. */
@Component({
  selector: 'app-room-art',
  template: `
    <svg viewBox="0 0 560 340" class="h-auto w-full" role="img" aria-label="A neon gaming room with rows of PCs and gaming chairs">
      <defs>
        <linearGradient id="ra-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1d6e" /><stop offset="1" stop-color="#0d0b1f" /></linearGradient>
        <linearGradient id="ra-scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed" /><stop offset="1" stop-color="#22d3ee" /></linearGradient>
        <linearGradient id="ra-scr2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316" /><stop offset="1" stop-color="#a855f7" /></linearGradient>
        <radialGradient id="ra-glow" cx="50%" cy="30%" r="60%"><stop offset="0" stop-color="#d946ef" stop-opacity="0.45" /><stop offset="1" stop-color="#d946ef" stop-opacity="0" /></radialGradient>
        <filter id="ra-blur"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <rect width="560" height="340" fill="url(#ra-wall)" />
      <rect width="560" height="340" fill="url(#ra-glow)" />
      <!-- ceiling strips -->
      <g stroke-linecap="round" fill="none">
        <path d="M30 20 L530 20" stroke="#a855f7" stroke-width="7" filter="url(#ra-blur)" /><path d="M30 20 L530 20" stroke="#ddd6fe" stroke-width="2.4" />
        <path d="M110 44 L450 44" stroke="#22d3ee" stroke-width="7" filter="url(#ra-blur)" /><path d="M110 44 L450 44" stroke="#a5f3fc" stroke-width="2.4" />
        <path d="M0 70 L120 56 M560 70 L440 56" stroke="#d946ef" stroke-width="3" opacity="0.7" />
      </g>
      <!-- wall panels -->
      <g fill="none" stroke="#a855f7" stroke-opacity="0.4" stroke-width="2">
        <rect x="26" y="84" width="92" height="64" rx="4" /><rect x="442" y="84" width="92" height="64" rx="4" />
        <path d="M36 104 H108 M36 120 H92 M452 104 H524 M452 120 H508" />
      </g>
      <!-- sign -->
      <g>
        <rect x="178" y="70" width="204" height="52" rx="12" fill="#0b0b14" stroke="#22d3ee" stroke-width="3" />
        <rect x="178" y="70" width="204" height="52" rx="12" fill="none" stroke="#22d3ee" stroke-width="8" opacity="0.4" filter="url(#ra-blur)" />
        <text x="280" y="95" text-anchor="middle" fill="#ddd6fe" font-family="Rajdhani, sans-serif" font-weight="700" font-size="23" letter-spacing="4" font-style="italic">E-SPORT</text>
        <text x="280" y="113" text-anchor="middle" fill="#22d3ee" font-family="Rajdhani, sans-serif" font-weight="700" font-size="13" letter-spacing="6">GAMING ARENA</text>
      </g>
      <!-- floor -->
      <path d="M0 200 H560 V340 H0Z" fill="#0b0b14" />
      <g stroke="#a855f7" stroke-opacity="0.35"><path d="M0 226 H560 M0 258 H560 M0 296 H560" /><path d="M280 200 L-80 340 M280 200 L120 340 M280 200 L280 340 M280 200 L440 340 M280 200 L640 340" /></g>

      <!-- back row -->
      <g>
        @for (x of backRow; track x; let i = $index) {
          <rect [attr.x]="x" y="158" width="72" height="48" rx="4" fill="#0b0b14" [attr.stroke]="i % 2 ? '#f97316' : '#a855f7'" stroke-width="2.4" />
          <rect [attr.x]="x + 4" y="162" width="64" height="38" rx="2" [attr.fill]="i % 2 ? 'url(#ra-scr2)' : 'url(#ra-scr)'" />
          <rect [attr.x]="x - 8" y="206" width="88" height="7" rx="3" fill="#17152b" stroke="#a855f7" stroke-opacity="0.5" />
          <rect [attr.x]="x + 16" y="214" width="40" height="34" rx="14" fill="#17152b" [attr.stroke]="i % 2 ? '#f97316' : '#22d3ee'" stroke-opacity="0.7" />
          <rect [attr.x]="x + 22" y="212" width="28" height="9" rx="4" [attr.fill]="i % 2 ? '#f97316' : '#22d3ee'" opacity="0.55" />
        }
      </g>
      <!-- front row -->
      <g>
        @for (x of frontRow; track x; let i = $index) {
          <rect [attr.x]="x" y="224" width="104" height="66" rx="5" fill="#0b0b14" [attr.stroke]="i % 2 ? '#22d3ee' : '#a855f7'" stroke-width="2.8" />
          <rect [attr.x]="x + 6" y="230" width="92" height="52" rx="3" [attr.fill]="i % 2 ? 'url(#ra-scr)' : 'url(#ra-scr2)'" />
          <path [attr.d]="'M' + (x + 12) + ' 274 L' + (x + 36) + ' 252 L' + (x + 54) + ' 264 L' + (x + 76) + ' 240 L' + (x + 92) + ' 270 Z'" fill="#0b0b14" fill-opacity="0.3" />
          <rect [attr.x]="x - 10" y="290" width="124" height="9" rx="4" fill="#17152b" stroke="#a855f7" stroke-opacity="0.6" />
          <rect [attr.x]="x - 10" y="299" width="124" height="3.5" rx="1.75" fill="#22d3ee" opacity="0.85" />
        }
      </g>
    </svg>
  `,
})
export class RoomArt {
  protected readonly backRow = [26, 132, 244, 356, 454];
  protected readonly frontRow = [30, 222, 394];
}

/** A large glowing controller for the closing band. */
@Component({
  selector: 'app-controller-art',
  template: `
    <svg viewBox="0 0 260 170" class="h-auto w-full" role="img" aria-label="A glowing game controller">
      <defs>
        <linearGradient id="ca-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d28d9" /><stop offset="1" stop-color="#1e1b4b" /></linearGradient>
        <linearGradient id="ca-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd" /><stop offset="1" stop-color="#22d3ee" /></linearGradient>
        <filter id="ca-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      <g transform="translate(14 14)">
        <path d="${CONTROLLER}" fill="#a855f7" filter="url(#ca-blur)" opacity="0.75" />
        <path d="${CONTROLLER}" fill="url(#ca-body)" stroke="url(#ca-rim)" stroke-width="4" stroke-linejoin="round" />
        <path d="M62 38 h18 M71 29 v18" stroke="#ddd6fe" stroke-width="5" stroke-linecap="round" fill="none" />
        <circle cx="160" cy="40" r="7" fill="#22d3ee" /><circle cx="178" cy="58" r="7" fill="#f97316" />
        <circle cx="142" cy="58" r="7" fill="#d946ef" /><circle cx="160" cy="76" r="7" fill="#fde047" />
        <circle cx="96" cy="86" r="14" fill="#0b0b14" stroke="#22d3ee" stroke-width="2.5" /><circle cx="148" cy="100" r="14" fill="#0b0b14" stroke="#d946ef" stroke-width="2.5" />
        <path d="M112 52 h20" stroke="#ddd6fe" stroke-width="4" stroke-linecap="round" opacity="0.6" />
      </g>
    </svg>
  `,
})
export class ControllerArt {}

/** A gamer bust with headphones and a controller, for the bottom of the sidebar. */
@Component({
  selector: 'app-side-art',
  template: `
    <svg viewBox="0 0 240 200" class="h-auto w-full" role="img" aria-label="Gamer with headphones and a controller">
      <defs>
        <radialGradient id="sa-glow" cx="50%" cy="58%" r="62%"><stop offset="0" stop-color="#a855f7" stop-opacity="0.7" /><stop offset="1" stop-color="#a855f7" stop-opacity="0" /></radialGradient>
        <linearGradient id="sa-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2f86" /><stop offset="1" stop-color="#14122b" /></linearGradient>
        <linearGradient id="sa-pad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd" /><stop offset="1" stop-color="#22d3ee" /></linearGradient>
      </defs>
      <ellipse cx="120" cy="116" rx="116" ry="86" fill="url(#sa-glow)" />
      <path d="M22 200 C28 148 66 126 120 126 C174 126 212 148 218 200Z" fill="url(#sa-body)" stroke="#22d3ee" stroke-opacity="0.75" stroke-width="2.2" />
      <path d="M76 132 C96 150 144 150 164 132" fill="none" stroke="#22d3ee" stroke-opacity="0.5" stroke-width="2.2" />
      <circle cx="120" cy="84" r="38" fill="#1d1a3d" stroke="#22d3ee" stroke-opacity="0.75" stroke-width="2.2" />
      <path d="M82 76 C86 38 154 38 158 76 C150 62 90 62 82 76Z" fill="#0e0b25" />
      <path d="M78 84 C72 30 168 30 162 84" fill="none" stroke="url(#sa-pad)" stroke-width="9" stroke-linecap="round" />
      <rect x="66" y="68" width="18" height="36" rx="9" fill="#7c3aed" stroke="#22d3ee" stroke-width="2.2" />
      <rect x="156" y="68" width="18" height="36" rx="9" fill="#7c3aed" stroke="#22d3ee" stroke-width="2.2" />
      <path d="M72 100 C64 126 92 132 108 124" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" />
      <circle cx="106" cy="88" r="3.2" fill="#22d3ee" /><circle cx="134" cy="88" r="3.2" fill="#22d3ee" />
      <path d="M110 104 C118 110 124 110 132 104" fill="none" stroke="#22d3ee" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round" />
      <g transform="translate(150 134) rotate(-9) scale(0.34)" fill="rgba(124,58,237,0.4)" stroke="url(#sa-pad)" stroke-width="9" stroke-linejoin="round">
        <path d="${CONTROLLER}" />
        <path d="M70 62h28M84 48v28" stroke-linecap="round" fill="none" />
        <circle cx="168" cy="58" r="8" fill="#22d3ee" stroke="none" /><circle cx="188" cy="78" r="8" fill="#f97316" stroke="none" />
      </g>
    </svg>
  `,
})
export class SideArt {}
