import { inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { SupabaseService } from './supabase.service';

export interface BrandFeature {
  title: string;
  text: string;
}

/** All the wording the Admin can change in Settings > Branding. Every field always has a value (see DEFAULT_BRAND). */
export interface Brand {
  shop_name: string;
  tagline: string;
  hero_text: string;
  features: BrandFeature[];
  studio_title: string;
  studio_text: string;
  checks: string[];
  rates_intro: string;
  canteen_intro: string;
  passes_intro: string;
  band_title: string;
  band_text: string;
  footer: string;
}

/** The built-in wording. A field the Admin leaves empty (or a failed load) falls back to this, so the site never shows a blank. */
export const DEFAULT_BRAND: Brand = {
  shop_name: 'E-Sports Gaming Arena',
  tagline: 'Play | Compete | Stream | Repeat',
  hero_text:
    'A premium gaming studio with high-performance PCs and consoles, billed fairly by the minute. See what is free and book your slot in under a minute.',
  features: [
    { title: 'High-End PCs & Consoles', text: 'Smooth, fast, ready to play' },
    { title: 'Ultra-Fast Network', text: 'Low ping, no lag' },
    { title: 'Instant Booking', text: 'See free times live' },
    { title: 'Easy Changes', text: 'Cancel or move until {hours} h before' },
  ],
  studio_title: 'The Ultimate *Gaming* Studio in Your City',
  studio_text:
    'Whether you are a casual gamer or a competitive player, {shop} gives you the right setup, comfort and honest pricing to level up your game.',
  checks: [
    'Performance gaming PCs',
    'Console and multiplayer zone',
    'Comfortable gaming lounge',
    'Fair billing by the minute, pay at the counter',
  ],
  rates_intro: 'Pick a game, pick your time. What you see here is what you pay, at the counter.',
  canteen_intro: 'Hungry mid-game? Add food and drinks to your gaming bill and pay once at the counter.',
  passes_intro: 'Daily and monthly passes, bought at the counter and used when you start a session.',
  band_title: 'Ready for your next session?',
  band_text: 'Pick a time, bring your friends, and walk in. We keep your station ready.',
  footer: '© {shop}',
};

const FIELD_MAX: Record<string, number> = {
  shop_name: 80,
  tagline: 120,
  hero_text: 400,
  studio_title: 120,
  studio_text: 500,
  rates_intro: 200,
  canteen_intro: 200,
  passes_intro: 200,
  band_title: 100,
  band_text: 200,
  footer: 120,
};

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Reads what the database sent and fills every empty or wrong field from DEFAULT_BRAND. Never throws. */
export function mergeBrand(raw: unknown): Brand {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (k: keyof typeof FIELD_MAX): string => text(r[k], FIELD_MAX[k]) || (DEFAULT_BRAND as unknown as Record<string, string>)[k];

  const feats = Array.isArray(r['features'])
    ? (r['features'] as unknown[])
        .map((f) => {
          const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
          return { title: text(o['title'], 40), text: text(o['text'], 80) };
        })
        .filter((f) => f.title !== '')
        .slice(0, 4)
    : [];
  const checks = Array.isArray(r['checks'])
    ? (r['checks'] as unknown[]).map((c) => text(c, 80)).filter((c) => c !== '').slice(0, 4)
    : [];

  return {
    shop_name: pick('shop_name'),
    tagline: pick('tagline'),
    hero_text: pick('hero_text'),
    features: feats.length > 0 ? feats : DEFAULT_BRAND.features,
    studio_title: pick('studio_title'),
    studio_text: pick('studio_text'),
    checks: checks.length > 0 ? checks : DEFAULT_BRAND.checks,
    rates_intro: pick('rates_intro'),
    canteen_intro: pick('canteen_intro'),
    passes_intro: pick('passes_intro'),
    band_title: pick('band_title'),
    band_text: pick('band_text'),
    footer: pick('footer'),
  };
}

/** Fills {shop} (the shop name) and {hours} (the cancel-before hours) in a text. Other braces stay as they are. */
export function fillBrand(s: string, shop: string, hours: number | null): string {
  return s.replace(/\{shop\}/g, shop).replace(/\{hours\}/g, String(hours ?? 2));
}

/**
 * The shop name as two lines for the big heading, the logo and the neon sign: "E-Sports Gaming Arena" -> "E-SPORTS" over "GAMING ARENA".
 * The first word goes on top. A one-word name is one line.
 */
export function titleLines(shopName: string): { top: string; main: string } {
  const words = shopName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { top: '', main: (words[0] ?? '').toUpperCase() };
  return { top: words[0].toUpperCase(), main: words.slice(1).join(' ').toUpperCase() };
}

/** A heading where *word* is shown with the glow ("The Ultimate *Gaming* Studio" -> three parts, the middle one glowing). Plain text, never HTML. */
export function glowParts(s: string): { t: string; glow: boolean }[] {
  return s
    .split('*')
    .map((t, i) => ({ t, glow: i % 2 === 1 }))
    .filter((p) => p.t !== '');
}

/** The tagline split at "|" into its words ("Play | Compete" -> ["Play", "Compete"]). */
export function taglineParts(tagline: string): string[] {
  return tagline.split('|').map((p) => p.trim()).filter(Boolean);
}

/** Squeezes an SVG sign text into `width` when it is longer than `maxChars` (so a long name never leaves the sign). Otherwise null (natural width). */
export function fitLength(text: string, maxChars: number, width: number): number | null {
  return text.length > maxChars ? width : null;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly sb = inject(SupabaseService).client;
  private readonly title = inject(Title);
  private started = false;

  /** The wording in use. Starts as the built-in wording, then switches to the shop's own once loaded. */
  readonly brand = signal<Brand>(DEFAULT_BRAND);

  /** Loads the shop's wording once (safe to call many times). A failure keeps the built-in wording. */
  load(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
  }

  /** Loads again (after the Admin saves Branding). */
  async refresh(): Promise<void> {
    try {
      const { data, error } = await this.sb.rpc('branding_info');
      if (error) return;
      const b = mergeBrand(data);
      this.brand.set(b);
      this.title.setTitle(b.shop_name);
    } catch {
      /* keep the built-in wording */
    }
  }
}
