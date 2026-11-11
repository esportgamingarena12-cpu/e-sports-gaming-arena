import { Component, input } from '@angular/core';

/**
 * The animated banner beside the login forms: a neon arena at night drawn in SVG, with moving screens,
 * sweeping light beams, rising sparks and a floating controller. All motion is plain CSS and is switched off
 * globally for people who ask their device for less motion (see styles.css).
 */
@Component({
  selector: 'app-login-stage',
  template: `
    <div class="relative isolate h-full min-h-44 overflow-hidden bg-[#0b0820]" data-stage [attr.data-variant]="variant()">
      <svg viewBox="0 0 600 640" preserveAspectRatio="xMidYMid slice" class="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2a1166" /><stop offset="0.55" stop-color="#14103a" /><stop offset="1" stop-color="#0b0820" />
          </linearGradient>
          <radialGradient id="ls-glow" cx="50%" cy="38%" r="55%">
            <stop offset="0" stop-color="#d946ef" stop-opacity="0.55" /><stop offset="1" stop-color="#d946ef" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="ls-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#e879f9" stop-opacity="0.5" /><stop offset="1" stop-color="#e879f9" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="ls-beam2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#22d3ee" stop-opacity="0.45" /><stop offset="1" stop-color="#22d3ee" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="ls-s1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d28d9" /><stop offset="1" stop-color="#22d3ee" /></linearGradient>
          <linearGradient id="ls-s2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316" /><stop offset="1" stop-color="#a21caf" /></linearGradient>
          <filter id="ls-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
          <clipPath id="ls-c1"><rect x="64" y="300" width="148" height="92" rx="4" /></clipPath>
          <clipPath id="ls-c2"><rect x="214" y="270" width="172" height="112" rx="4" /></clipPath>
          <clipPath id="ls-c3"><rect x="388" y="300" width="148" height="92" rx="4" /></clipPath>
        </defs>

        <rect width="600" height="640" fill="url(#ls-sky)" />
        <rect width="600" height="640" fill="url(#ls-glow)" />

        <!-- sweeping light beams -->
        <g class="ls-sweep-a"><path d="M120 -20 L180 -20 L300 460 L40 460Z" fill="url(#ls-beam)" /></g>
        <g class="ls-sweep-b"><path d="M440 -20 L500 -20 L620 460 L360 460Z" fill="url(#ls-beam2)" /></g>

        <!-- neon sign -->
        <g class="ls-flicker">
          <rect x="170" y="84" width="260" height="76" rx="16" fill="#0b0b14" stroke="#22d3ee" stroke-width="3.5" />
          <rect x="170" y="84" width="260" height="76" rx="16" fill="none" stroke="#22d3ee" stroke-width="10" opacity="0.45" filter="url(#ls-blur)" />
          <text x="300" y="124" text-anchor="middle" fill="#ede9fe" font-family="Rajdhani, sans-serif" font-weight="700" font-size="34" letter-spacing="6" font-style="italic">E-SPORT</text>
          <text x="300" y="148" text-anchor="middle" fill="#22d3ee" font-family="Rajdhani, sans-serif" font-weight="700" font-size="16" letter-spacing="9">GAMING ARENA</text>
        </g>

        <!-- floor with perspective grid -->
        <path d="M0 400 H600 V640 H0Z" fill="#0b0b14" />
        <g stroke="#a855f7" stroke-opacity="0.4" fill="none">
          <path d="M0 430 H600 M0 470 H600 M0 520 H600 M0 585 H600" />
          <path d="M300 400 L-200 640 M300 400 L50 640 M300 400 L300 640 M300 400 L550 640 M300 400 L800 640" />
        </g>
        <rect x="0" y="400" width="600" height="3" fill="#22d3ee" opacity="0.8" class="ls-scan" />

        <!-- desk -->
        <rect x="40" y="392" width="520" height="14" rx="6" fill="#17152b" stroke="#a855f7" stroke-opacity="0.7" />
        <rect x="40" y="406" width="520" height="4" rx="2" fill="#22d3ee" opacity="0.9" />

        <!-- three monitors -->
        <g>
          <rect x="60" y="296" width="156" height="100" rx="6" fill="#0b0b14" stroke="#a855f7" stroke-width="3" />
          <rect x="64" y="300" width="148" height="92" rx="4" fill="url(#ls-s1)" />
          <g clip-path="url(#ls-c1)">
            @for (b of barsA; track b.x) {
              <rect [attr.x]="b.x" y="320" width="14" height="72" rx="2" fill="#0b0b14" fill-opacity="0.35" class="ls-bar" [style.animation-delay]="b.d" />
            }
            <rect x="64" y="300" width="148" height="18" fill="#ede9fe" opacity="0.12" class="ls-scrollscreen" />
          </g>

          <rect x="210" y="266" width="180" height="120" rx="6" fill="#0b0b14" stroke="#22d3ee" stroke-width="3.5" />
          <rect x="214" y="270" width="172" height="112" rx="4" fill="url(#ls-s2)" />
          <g clip-path="url(#ls-c2)">
            <path d="M214 372 L246 330 L276 352 L316 296 L346 340 L386 308 V382 H214Z" fill="#0b0b14" fill-opacity="0.4" />
            <circle cx="300" cy="326" r="26" fill="none" stroke="#fde047" stroke-width="3" opacity="0.9" class="ls-ring" />
            <circle cx="300" cy="326" r="5" fill="#fde047" />
            <rect x="214" y="270" width="172" height="20" fill="#fff" opacity="0.14" class="ls-scrollscreen" />
          </g>

          <rect x="384" y="296" width="156" height="100" rx="6" fill="#0b0b14" stroke="#a855f7" stroke-width="3" />
          <rect x="388" y="300" width="148" height="92" rx="4" fill="url(#ls-s1)" />
          <g clip-path="url(#ls-c3)">
            @for (b of barsB; track b.x) {
              <rect [attr.x]="b.x" y="320" width="14" height="72" rx="2" fill="#0b0b14" fill-opacity="0.35" class="ls-bar" [style.animation-delay]="b.d" />
            }
            <rect x="388" y="300" width="148" height="18" fill="#ede9fe" opacity="0.12" class="ls-scrollscreen" style="animation-delay: -1.2s" />
          </g>
        </g>

        <!-- gamer from behind: chair and head with headset -->
        <g class="ls-breathe">
          <rect x="248" y="420" width="104" height="150" rx="40" fill="#14122b" stroke="#22d3ee" stroke-opacity="0.8" stroke-width="2.5" />
          <rect x="268" y="408" width="64" height="18" rx="9" fill="#22d3ee" opacity="0.65" />
          <circle cx="300" cy="382" r="30" fill="#1d1a3d" stroke="#a855f7" stroke-width="2.5" />
          <path d="M268 384 C262 340 338 340 332 384" fill="none" stroke="#22d3ee" stroke-width="8" stroke-linecap="round" />
          <rect x="258" y="372" width="14" height="30" rx="7" fill="#7c3aed" stroke="#22d3ee" stroke-width="2" />
          <rect x="328" y="372" width="14" height="30" rx="7" fill="#7c3aed" stroke="#22d3ee" stroke-width="2" />
        </g>

        <!-- floating controller -->
        <g class="ls-hover" transform="translate(458 150)">
          <g transform="scale(0.5) rotate(10)">
            <path d="M62 22h116c28 0 46 22 52 58l8 52c6 34-24 52-48 30l-28-26H78l-28 26c-24 22-54 4-48-30l8-52c6-36 24-58 52-58z" fill="#a855f7" filter="url(#ls-blur)" opacity="0.8" />
            <path d="M62 22h116c28 0 46 22 52 58l8 52c6 34-24 52-48 30l-28-26H78l-28 26c-24 22-54 4-48-30l8-52c6-36 24-58 52-58z" fill="#2b1a6b" stroke="#c4b5fd" stroke-width="5" stroke-linejoin="round" />
            <path d="M62 38 h18 M71 29 v18" stroke="#ddd6fe" stroke-width="6" stroke-linecap="round" fill="none" />
            <circle cx="160" cy="40" r="8" fill="#22d3ee" /><circle cx="180" cy="60" r="8" fill="#f97316" />
            <circle cx="140" cy="60" r="8" fill="#d946ef" /><circle cx="160" cy="80" r="8" fill="#fde047" />
          </g>
        </g>

        <!-- rising sparks -->
        <g>
          @for (s of sparks; track s.x) {
            <circle [attr.cx]="s.x" cy="600" [attr.r]="s.r" [attr.fill]="s.c" class="ls-spark" [style.animation-delay]="s.d" [style.animation-duration]="s.t" />
          }
        </g>
      </svg>

      <!-- vignette so the text stays readable -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-[#0b0820] via-[#0b0820]/70 to-transparent"></div>

      <div class="relative flex h-full min-h-44 flex-col justify-end gap-2 p-5 sm:p-7">
        <span class="eyebrow">{{ eyebrow() }}</span>
        <h2 class="font-display text-2xl font-bold leading-tight text-slate-50 sm:text-4xl">
          {{ headline() }}
        </h2>
        <p class="hidden max-w-sm text-sm text-slate-300 sm:block">{{ tagline() }}</p>
        <ul class="mt-1 hidden flex-wrap gap-2 sm:flex" data-chips>
          @for (c of chips(); track c) {
            <li class="rounded-full border border-cyan-400/40 bg-slate-950/60 px-3 py-1 text-xs font-medium text-cyan-200 backdrop-blur">{{ c }}</li>
          }
        </ul>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    svg * { transform-box: fill-box; }
    .ls-bar { transform-origin: bottom; animation: ls-bar 2.4s ease-in-out infinite; }
    .ls-scrollscreen { animation: ls-scroll 3.4s linear infinite; }
    .ls-ring { transform-origin: center; animation: ls-ring 2.8s ease-out infinite; }
    .ls-flicker { animation: ls-flicker 5s steps(1) infinite; }
    .ls-sweep-a { transform-origin: 50% 0; animation: ls-sweep 7s ease-in-out infinite; }
    .ls-sweep-b { transform-origin: 50% 0; animation: ls-sweep 8.5s ease-in-out infinite reverse; }
    .ls-scan { animation: ls-scan 4s ease-in-out infinite alternate; }
    .ls-hover { animation: ls-hover 5s ease-in-out infinite; }
    .ls-breathe { transform-origin: center bottom; animation: ls-breathe 4s ease-in-out infinite; }
    .ls-spark { animation-name: ls-spark; animation-iteration-count: infinite; animation-timing-function: ease-out; opacity: 0; }
    @keyframes ls-bar { 0%, 100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }
    @keyframes ls-scroll { from { transform: translateY(0); } to { transform: translateY(80px); } }
    @keyframes ls-ring { 0% { transform: scale(0.6); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
    @keyframes ls-flicker { 0%, 100% { opacity: 1; } 92% { opacity: 0.55; } 94% { opacity: 1; } 96% { opacity: 0.7; } }
    @keyframes ls-sweep { 0%, 100% { transform: rotate(-9deg); } 50% { transform: rotate(9deg); } }
    @keyframes ls-scan { from { transform: translateY(0); } to { transform: translateY(200px); } }
    @keyframes ls-hover { 0%, 100% { transform: translate(458px, 150px); } 50% { transform: translate(458px, 134px); } }
    @keyframes ls-breathe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @keyframes ls-spark { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 0.95; } 100% { transform: translateY(-420px); opacity: 0; } }
  `,
})
export class LoginStage {
  readonly variant = input<'staff' | 'customer'>('customer');
  readonly eyebrow = input('E-Sports Gaming Arena');
  readonly headline = input('Level up your game time');
  readonly tagline = input('Book a station, play, pay at the counter.');
  readonly chips = input<string[]>([]);

  protected readonly barsA = bars(64, 148, 0);
  protected readonly barsB = bars(388, 148, 1);
  protected readonly sparks = [40, 90, 150, 210, 270, 330, 390, 450, 510, 560].map((x, i) => ({
    x,
    r: 1.6 + (i % 3) * 0.9,
    c: ['#22d3ee', '#f97316', '#d946ef', '#fde047'][i % 4],
    d: `${-(i * 0.9)}s`,
    t: `${5 + (i % 4)}s`,
  }));
}

function bars(x0: number, width: number, seed: number): { x: number; d: string }[] {
  const n = 8;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + 6 + i * ((width - 12) / n), d: `${-((i * 0.37 + seed * 0.5) % 2.4)}s` }));
}
