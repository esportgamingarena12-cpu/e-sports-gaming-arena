import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { formatIstTime, todayIst } from '../shared/format';
import { RouterLink } from '@angular/router';
import { ClockArt, ControllerArt, RoomArt } from '../shared/art';
import { GamePoster } from '../shared/game-poster';
import { HeroSlide, HeroSlider } from '../shared/hero-slider';
import { Icon } from '../shared/icon';
import { BookingInfo, BookingService, FreeSlot } from './booking.service';
import { lengthLabel, typeLabel } from './portal';
import { buildPlans } from './plans';
import { LegalLinks } from '../legal/legal-links';
import { FoodPic } from '../shared/food-image';
import { ServerClock } from '../core/server-clock';
import { BrandingService, fillBrand, glowParts, taglineParts, titleLines } from '../core/branding';
import { gamesFor, stillComing, tickerItems, tickerLabel } from './games';
import { dayChips, dayText } from './slot-picker';
import { buildRateCard, gameHighlights, HoursGroup, hoursSummary, istParts, minutesLabel, openStatus } from './rate-card';

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Public booking page: anyone can see free times; signing in is asked only when they pick one. */
@Component({
  selector: 'app-book-home',
  imports: [Icon, RoomArt, ControllerArt, ClockArt, RouterLink, FoodPic, GamePoster, HeroSlider, HeroSlide, LegalLinks],
  template: `
    <!-- Coming-soon ticker: upcoming games and the new ones, set by the owner in Admin > Games -->
    @if (ticker().length > 0) {
      <div class="relative border-y border-fuchsia-400/30 bg-linear-to-r from-violet-900/70 via-slate-950 to-fuchsia-900/60" role="region" [attr.aria-label]="tickerTitle()" data-ticker>
        <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <span class="shrink-0 rounded-full bg-linear-to-r from-violet-600 to-fuchsia-500 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_16px_-2px_rgb(217_70_239_/_0.9)]" data-ticker-label>{{ tickerTitle() }}</span>
          <div class="ticker-viewport relative min-w-0 flex-1 overflow-hidden" tabindex="0" aria-label="Upcoming and new games">
            <ul class="ticker-track flex w-max items-center gap-10 whitespace-nowrap" [style.--ticker-time]="tickerSeconds()" [style.--ticker-shift]="tickerShift()">
              @for (c of tickerCopies(); track c) {
                @for (it of ticker(); track $index) {
                  <li class="flex items-center gap-2 text-sm" [class.ticker-copy]="c > 0" [attr.aria-hidden]="c > 0 ? 'true' : null" data-ticker-item>
                    <span class="badge" [class]="it.kind === 'soon' ? 'bg-fuchsia-500/25 text-fuchsia-200' : 'bg-emerald-500/20 text-emerald-300'">{{ it.kind === 'soon' ? 'SOON' : 'NEW' }}</span>
                    <span class="font-medium text-slate-100">{{ it.text }}</span>
                  </li>
                }
              }
            </ul>
          </div>
        </div>
      </div>
    }

    <!-- Hero -->
    <section class="relative px-4 pb-10 pt-8 sm:pt-12">
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div class="absolute -left-32 -top-10 h-[130%] w-80 -skew-x-12 bg-linear-to-b from-fuchsia-600/45 via-violet-700/20 to-transparent blur-2xl"></div>
        <div class="absolute right-0 top-0 h-full w-2/3 bg-radial from-violet-700/30 to-transparent"></div>
      </div>
      <div class="relative mx-auto max-w-7xl pb-8">
       <app-hero-slider label="Arena highlights" data-hero-slider>
        <div appSlide class="grid items-center gap-4 md:grid-cols-[1fr_1.25fr]" data-slide-welcome>
        <div>
          <p class="eyebrow">Welcome to</p>
          <h1 class="mt-2 font-display text-5xl font-bold italic leading-[0.95] tracking-wide sm:text-6xl lg:text-7xl" data-hero-title>
            @if (lines().top) { {{ lines().top }}<br /> }<span class="glow-text">{{ lines().main }}</span>
          </h1>
          <p class="mt-4 font-display text-lg font-semibold tracking-wide text-slate-100" data-tagline>
            @for (w of taglineWords(); track $index; let last = $last) {
              {{ w }} @if (!last) { <span class="text-violet-400">|</span> }
            }
          </p>
          <p class="mt-3 max-w-md text-sm text-slate-300">{{ brand().hero_text }}</p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a href="#book" class="btn-primary inline-flex items-center gap-2" data-hero-book>Book a Gaming Slot <app-icon name="play" [size]="16" /></a>
            <a href="#rates" class="btn-outline inline-flex items-center" data-view-rates>View Rates</a>
          </div>
        </div>
        <div class="mx-auto w-full max-w-md animate-float md:max-w-none">
          <img data-hero-image src="images/hero.png" width="755" height="488" fetchpriority="high" alt="A gamer wearing a headset at a desk with three screens showing football, a shooter and a battle royale map, with a game controller floating above" class="h-auto w-full rounded-3xl border border-fuchsia-400/30 shadow-[0_0_60px_-10px_rgba(168,85,247,0.6)]" />
        </div>
        </div>

        <!-- Slide 2: games available -->
        @if (games().length > 0 || posterGames().length > 0) {
          <div appSlide class="grid items-center gap-6 md:grid-cols-[1fr_1.45fr]" data-slide-games>
            <div>
              <p class="eyebrow">Games available</p>
              <h2 class="mt-2 font-display text-4xl font-bold leading-[1] tracking-wide sm:text-5xl lg:text-6xl">
                Games available in <span class="glow-text">{{ gamesText() }}</span>
              </h2>
              <p class="mt-4 max-w-md text-sm text-slate-300">
                @if (posterGames().length > 0) { Our players' favourites, from the latest hits to the classics. Pick your game, choose your time and walk in ready to play. }
                @else { Pick your game, choose your time and walk in ready to play. Fixed prices, no surprises. }
              </p>
              @if (posterGames().length > 0 && games().length > 1) {
                <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Show games for" data-game-filter>
                  <button type="button" class="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition"
                          [class]="gameFilter() === null ? 'border-violet-300 bg-linear-to-r from-violet-600 to-fuchsia-500 text-white' : 'border-slate-600 text-slate-300 hover:border-cyan-300'"
                          (click)="gameFilter.set(null)" data-filter-all>All</button>
                  @for (g of games(); track g.type) {
                    <button type="button" class="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition"
                            [class]="gameFilter() === g.type ? 'border-violet-300 bg-linear-to-r from-violet-600 to-fuchsia-500 text-white' : 'border-slate-600 text-slate-300 hover:border-cyan-300'"
                            (click)="gameFilter.set(g.type)" [attr.data-filter]="g.label">
                      {{ g.label }}@if (g.price !== null) { <span class="ml-1 text-xs font-medium opacity-80">from ₹{{ g.price }}</span> }
                    </button>
                  }
                </div>
              }
              <div class="mt-5 flex flex-wrap gap-3">
                <button type="button" class="btn-primary inline-flex items-center gap-2" (click)="chooseType(gameFilter())" data-slide-book>Book a Gaming Slot <app-icon name="play" [size]="16" /></button>
                <a href="#rates" class="btn-outline inline-flex items-center">View Rates</a>
              </div>
              @if (upcomingNames().length > 0) {
                <p class="mt-4 text-xs text-slate-400" data-slide-upcoming>
                  <span class="mr-1 font-semibold uppercase tracking-wider text-fuchsia-300">Coming soon</span>{{ upcomingNames().join(' · ') }}
                </p>
              }
            </div>

            @if (posterGames().length > 0) {
              <div>
                <ul class="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3" data-game-posters>
                  @for (g of shownGames(); track g.title) {
                    <li class="group relative overflow-hidden rounded-2xl border border-violet-400/40 bg-slate-950 shadow-[0_0_30px_-12px_rgb(168_85_247_/_0.9)] transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_0_34px_-8px_rgb(34_211_238_/_0.9)]" [attr.data-game-card]="g.title">
                      <app-game-poster class="aspect-[3/4] w-full" [path]="g.image_path" [title]="g.title" />
                      <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-slate-950 via-slate-950/85 to-transparent p-2 pt-9">
                        <p class="truncate text-xs font-bold sm:text-sm">{{ g.title }}</p>
                        <p class="truncate text-[10px] font-semibold uppercase tracking-wider text-cyan-300">{{ g.station_type ? label(g.station_type) : typesText() }}</p>
                      </div>
                      <div class="absolute left-1.5 top-1.5 flex flex-col gap-1">
                        @if (g.hot) { <span class="badge bg-linear-to-r from-orange-500 to-rose-500 text-white shadow" data-badge-hot>HOT</span> }
                        @if (g.is_new) { <span class="badge bg-emerald-500 text-white shadow" data-badge-new>NEW</span> }
                      </div>
                    </li>
                  }
                </ul>
                @if (moreGames() > 0) { <p class="mt-2 text-right text-xs text-slate-400" data-more-games>+ {{ moreGames() }} more at the studio</p> }
              </div>
            } @else {
              <div class="grid gap-4 sm:grid-cols-2" data-game-tiles>
                @for (g of games(); track g.type) {
                  <button type="button" (click)="chooseType(g.type)" [attr.data-game-tile]="g.label"
                          class="group relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl border border-cyan-400/50 bg-linear-to-b from-violet-700/40 via-slate-900 to-slate-950 p-6 text-center shadow-[0_0_50px_-16px_rgb(34_211_238_/_0.8)] transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_0_60px_-10px_rgb(34_211_238_/_0.9)]">
                    <span class="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-fuchsia-600/25 blur-3xl" aria-hidden="true"></span>
                    <span class="relative grid size-24 place-items-center rounded-3xl bg-linear-to-br from-violet-600 to-fuchsia-500 text-white shadow-[0_0_40px_-6px_rgb(217_70_239_/_0.9)]"><app-icon [name]="g.icon" [size]="52" /></span>
                    <span class="relative font-display text-4xl font-bold">{{ g.label }}</span>
                    @if (g.note) { <span class="relative text-sm text-slate-300">{{ g.note }}</span> }
                    @if (g.price !== null) {
                      <span class="relative rounded-full border border-cyan-300/50 bg-slate-950/70 px-4 py-1 font-display text-xl font-bold text-cyan-100" data-game-price>From ₹{{ g.price }} <span class="text-sm font-medium text-slate-400">/ {{ g.per }}</span></span>
                    }
                    <span class="relative inline-flex items-center gap-1 text-sm font-semibold text-cyan-300 group-hover:text-cyan-200">Book now <app-icon name="arrow" [size]="16" /></span>
                  </button>
                }
              </div>
            }
          </div>
        }

        <!-- Slide 3: timings -->
        @if (hours().length > 0) {
          <div appSlide class="grid items-center gap-6 md:grid-cols-[1.25fr_1fr]" data-slide-timings>
            <div>
              <p class="eyebrow">Timings</p>
              <h2 class="mt-2 font-display text-4xl font-bold leading-[1] tracking-wide sm:text-5xl lg:text-6xl">When we are <span class="glow-text">open</span></h2>
              @if (status(); as st) {
                <p class="mt-4">
                  <span class="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ring-1"
                        [class]="st.open ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/50' : 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/50'" data-slide-status>
                    <span class="relative flex size-2.5">
                      <span class="absolute inline-flex size-full animate-ping rounded-full opacity-75" [class]="st.open ? 'bg-emerald-400' : 'bg-fuchsia-400'"></span>
                      <span class="relative inline-flex size-2.5 rounded-full" [class]="st.open ? 'bg-emerald-400' : 'bg-fuchsia-400'"></span>
                    </span>
                    {{ st.text }}
                  </span>
                </p>
              }
              <ul class="mt-5 max-w-lg space-y-2.5">
                @for (h of hours(); track h.days) {
                  <li class="flex items-center justify-between gap-2 rounded-2xl border px-3 py-3 sm:gap-3 sm:px-5 sm:py-3.5"
                      [class]="isToday(h) ? 'border-cyan-300/70 bg-linear-to-r from-cyan-400/15 to-violet-500/10 shadow-[0_0_30px_-10px_rgb(34_211_238_/_0.9)]' : 'border-slate-700/60 bg-slate-900/60'"
                      [attr.data-slide-hours]="h.days">
                    <span class="flex items-center gap-2 whitespace-nowrap text-sm font-medium sm:text-base">
                      <span class="text-violet-300"><app-icon name="clock" [size]="20" /></span>{{ h.days }}
                      @if (isToday(h)) { <span class="badge bg-cyan-400/20 text-cyan-200">Today</span> }
                    </span>
                    <span class="whitespace-nowrap font-display text-base font-bold sm:text-xl lg:text-2xl">{{ h.time }}</span>
                  </li>
                }
              </ul>
            </div>
            <div class="mx-auto w-full max-w-[11rem] animate-float sm:max-w-[16rem] md:max-w-sm"><app-clock-art [minutes]="istMinutes()" [open]="status()?.open ?? true" /></div>
          </div>
        }

        <!-- Slide 4: canteen facility -->
        @if (canteen(); as c) {
          <div appSlide class="grid items-center gap-6 md:grid-cols-[1fr_1.25fr]" data-slide-canteen>
            <div>
              <span class="grid size-14 place-items-center rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_30px_-4px_rgb(217_70_239_/_0.9)]"><app-icon name="cup" [size]="30" /></span>
              <p class="eyebrow mt-3">Canteen</p>
              <h2 class="mt-2 font-display text-4xl font-bold leading-[1] tracking-wide sm:text-5xl lg:text-6xl">Snacks &amp; food, <span class="glow-text">right where you play</span></h2>
              <p class="mt-4 max-w-md text-sm text-slate-300">{{ brand().canteen_intro }}</p>
              <ul class="mt-4 flex flex-wrap gap-2">
                @for (cat of c.categories; track cat) {
                  <li class="rounded-full border border-fuchsia-300/40 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-fuchsia-100">{{ cat }}</li>
                }
              </ul>
              <a href="#canteen" class="btn-outline mt-5 inline-flex items-center gap-2">See the canteen <app-icon name="arrow" [size]="16" /></a>
            </div>
            <ul class="grid grid-cols-2 gap-3 sm:gap-4" data-slide-canteen-items>
              @for (it of c.items.slice(0, 4); track it.name) {
                <li class="overflow-hidden rounded-2xl border border-violet-400/40 bg-slate-950/60 shadow-[0_0_34px_-14px_rgb(217_70_239_/_0.9)]" [attr.data-slide-canteen-item]="it.name">
                  <app-food-pic class="aspect-[16/10] w-full" [path]="it.image_path" [name]="it.name" />
                  <div class="flex items-center justify-between gap-2 p-3">
                    <span class="min-w-0 truncate text-sm font-semibold sm:text-base">{{ it.name }}</span>
                    <span class="shrink-0 rounded-full bg-linear-to-r from-violet-600 to-fuchsia-500 px-2.5 py-0.5 text-sm font-bold text-white">₹{{ it.price }}</span>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
       </app-hero-slider>
      </div>

      <div class="relative z-10 mx-auto -mb-16 mt-2 grid max-w-7xl grid-cols-2 divide-slate-700/60 rounded-xl border border-violet-500/30 bg-slate-900/85 shadow-[0_0_40px_-12px_rgb(139_92_246_/_0.8)] backdrop-blur md:-mt-4 md:grid-cols-4 md:divide-x" data-features>
        @for (f of features(); track f.title) {
          <div class="flex flex-col items-center gap-2 px-3 py-4 text-center">
            <span class="text-violet-300 drop-shadow-[0_0_8px_rgb(34_211_238_/_0.7)]"><app-icon [name]="f.icon" [size]="32" /></span>
            <p class="text-sm font-semibold text-slate-100">{{ f.title }}</p>
            <p class="text-xs text-slate-400">{{ f.text }}</p>
          </div>
        }
      </div>
    </section>

    <!-- The studio -->
    <section id="studio" class="mx-auto max-w-7xl scroll-mt-20 px-4 pb-8 pt-24">
      <div class="grid items-center gap-6 md:grid-cols-2">
        <div class="overflow-hidden rounded-xl border border-violet-400/50 shadow-[0_0_50px_-10px_rgb(168_85_247_/_0.9)]"><app-room-art /></div>
        <div>
          <h2 class="font-display text-3xl font-bold leading-tight sm:text-4xl" data-studio-title>@for (p of studioTitle(); track $index) { @if (p.glow) { <span class="glow-text">{{ p.t }}</span> } @else { {{ p.t }} } }</h2>
          <p class="mt-3 text-sm text-slate-300">{{ studioText() }}</p>
          <ul class="mt-4 space-y-2 text-sm" data-checks>
            @for (c of checks(); track c) {
              <li class="flex items-center gap-2"><span class="text-cyan-300"><app-icon name="check" [size]="18" /></span>{{ c }}</li>
            }
          </ul>
        </div>
      </div>
    </section>

    <!-- Rates, timings and games (real data from the shop settings) -->
    @if (info(); as i) {
      @if (rateCard() || hours().length || i.types.length > 0) {
        <section id="rates" class="relative mx-auto max-w-7xl scroll-mt-20 px-4 py-10" data-rates-section>
          <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-radial from-violet-700/25 to-transparent" aria-hidden="true"></div>
          <div class="text-center">
            <p class="eyebrow">Rates &amp; timings</p>
            <h2 class="mt-1 font-display text-4xl font-bold sm:text-5xl">Simple, <span class="glow-text">fixed prices</span></h2>
            <p class="mx-auto mt-2 max-w-xl text-sm text-slate-300">{{ brand().rates_intro }}</p>
          </div>

          <div class="mt-8 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            @if (rateCard(); as rc) {
              <div class="relative overflow-hidden rounded-3xl border border-violet-400/40 bg-slate-900/70 shadow-[0_0_60px_-18px_rgb(168_85_247_/_0.9)] backdrop-blur" data-rate-card>
                <div class="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-fuchsia-600/20 blur-3xl" aria-hidden="true"></div>
                <div class="relative flex items-center justify-between gap-3 border-b border-violet-500/30 bg-linear-to-r from-violet-700/50 via-fuchsia-700/20 to-transparent px-5 py-4">
                  <div>
                    <p class="eyebrow">Rate card</p>
                    <h3 class="font-display text-2xl font-bold sm:text-3xl">Pay by the pack</h3>
                  </div>
                  <span class="hidden size-12 place-items-center rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_24px_-4px_rgb(217_70_239_/_0.8)] sm:grid"><app-icon name="rupee" [size]="26" /></span>
                </div>

                <div class="relative px-3 pb-2 pt-3 sm:px-5">
                  <div class="grid items-center gap-2 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs" [style.grid-template-columns]="cols(rc.minutes.length)">
                    <span>Game</span>
                    @for (m of rc.minutes; track m) { <span class="text-center">{{ minutesText(m) }}</span> }
                  </div>
                  <ul class="space-y-2">
                    @for (r of rc.rows; track r.label) {
                      <li class="grid items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-950/50 px-3 py-3 transition hover:border-cyan-400/60 hover:bg-slate-950/80 hover:shadow-[0_0_28px_-10px_rgb(34_211_238_/_0.9)]"
                          [style.grid-template-columns]="cols(rc.minutes.length)" data-rate-row [attr.data-row]="r.label">
                        <span class="flex min-w-0 items-center gap-2 font-display text-base font-bold sm:text-lg">
                          <span class="hidden size-8 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-violet-200 sm:grid"><app-icon [name]="r.station_type === 'pc' ? 'monitor' : 'gamepad'" [size]="18" /></span>
                          <span class="min-w-0 leading-tight">{{ r.label }}</span>
                        </span>
                        @for (m of rc.minutes; track m) {
                          @if (r.prices[m] !== undefined) {
                            <span class="mx-auto rounded-xl bg-linear-to-b from-cyan-400/20 to-cyan-400/5 px-2.5 py-1.5 font-display text-lg font-bold text-cyan-100 ring-1 ring-cyan-300/40 sm:px-3 sm:text-xl" [attr.data-price]="m">₹{{ r.prices[m] }}</span>
                          } @else {
                            <span class="text-center text-slate-600">–</span>
                          }
                        }
                      </li>
                    }
                  </ul>
                </div>

                <div class="relative flex flex-wrap items-center justify-between gap-3 px-5 pb-5 pt-2">
                  <p class="text-xs text-slate-400">Time beyond your pack is billed by the minute in fair blocks.</p>
                  <a href="#book" class="btn-primary inline-flex items-center gap-2" data-rates-book>Book a slot <app-icon name="arrow" [size]="16" /></a>
                </div>
              </div>
            }

            <div class="space-y-5">
              @if (hours().length) {
                <div class="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-slate-900/70 p-5 shadow-[0_0_50px_-18px_rgb(34_211_238_/_0.8)] backdrop-blur" data-hours>
                  <div class="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true"></div>
                  <div class="relative flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="eyebrow">Timings</p>
                      <h3 class="font-display text-2xl font-bold">When we are open</h3>
                    </div>
                    @if (status(); as st) {
                      <span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1"
                            [class]="st.open ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/50' : 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/50'" data-open-status [attr.data-open]="st.open">
                        <span class="relative flex size-2">
                          <span class="absolute inline-flex size-full animate-ping rounded-full opacity-75" [class]="st.open ? 'bg-emerald-400' : 'bg-fuchsia-400'"></span>
                          <span class="relative inline-flex size-2 rounded-full" [class]="st.open ? 'bg-emerald-400' : 'bg-fuchsia-400'"></span>
                        </span>
                        {{ st.text }}
                      </span>
                    }
                  </div>
                  <ul class="relative mt-4 space-y-2">
                    @for (h of hours(); track h.days) {
                      <li class="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                          [class]="isToday(h) ? 'border-cyan-300/70 bg-linear-to-r from-cyan-400/15 to-violet-500/10 shadow-[0_0_28px_-10px_rgb(34_211_238_/_0.9)]' : 'border-slate-700/60 bg-slate-950/50'"
                          [attr.data-hours-group]="h.days" [attr.data-today]="isToday(h)">
                        <span class="flex items-center gap-2 font-medium">
                          <span class="text-violet-300"><app-icon name="clock" [size]="18" /></span>{{ h.days }}
                          @if (isToday(h)) { <span class="badge bg-cyan-400/20 text-cyan-200">Today</span> }
                        </span>
                        <span class="font-display text-lg font-bold text-slate-50" data-hours-row>{{ h.time }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }

              @if (i.types.length > 0) {
                <div class="rounded-3xl border border-violet-500/40 bg-linear-to-br from-violet-700/30 via-slate-900 to-slate-900 p-5 shadow-[0_0_40px_-14px_rgb(168_85_247_/_0.9)]" data-games>
                  <p class="eyebrow">Games available</p>
                  <h3 class="mt-1 font-display text-2xl font-bold">Games available in <span class="glow-text">{{ gamesText() }}</span></h3>
                  <div class="mt-4 grid grid-cols-2 gap-3">
                    @for (t of i.types; track t) {
                      <button type="button" class="flex flex-col items-center gap-1.5 rounded-2xl border border-cyan-400/40 bg-slate-950/60 p-4 text-center transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_0_26px_-6px_rgb(34_211_238_/_0.9)]"
                              (click)="chooseType(t)" [attr.data-game]="label(t)">
                        <span class="text-cyan-300"><app-icon [name]="t === 'pc' ? 'monitor' : 'gamepad'" [size]="34" /></span>
                        <span class="font-display text-xl font-bold">{{ label(t) }}</span>
                        <span class="text-xs text-slate-400">{{ t === 'pc' ? 'Per PC seat' : 'Up to 4 players' }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </section>
      }
    }

    <!-- Canteen: a few highlighted items, not the whole menu -->
    @if (canteen(); as c) {
      <section id="canteen" class="mx-auto max-w-7xl scroll-mt-20 px-4 py-8" data-canteen>
        <div class="relative overflow-hidden rounded-3xl border border-fuchsia-400/40 bg-linear-to-br from-fuchsia-700/25 via-slate-900 to-slate-900 p-5 shadow-[0_0_60px_-18px_rgb(217_70_239_/_0.9)] sm:p-8">
          <div class="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-violet-600/20 blur-3xl" aria-hidden="true"></div>
          <div class="relative grid gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-center">
            <div>
              <span class="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_24px_-4px_rgb(217_70_239_/_0.8)]"><app-icon name="cup" [size]="26" /></span>
              <p class="eyebrow mt-3">Canteen</p>
              <h2 class="mt-1 font-display text-3xl font-bold sm:text-4xl">Snacks &amp; food, <span class="glow-text">right where you play</span></h2>
              <p class="mt-3 text-sm text-slate-300">{{ brand().canteen_intro }}</p>
              <ul class="mt-4 flex flex-wrap gap-2" data-canteen-categories>
                @for (cat of c.categories; track cat) {
                  <li class="rounded-full border border-fuchsia-300/40 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-fuchsia-100">{{ cat }}</li>
                }
              </ul>
            </div>
            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3" data-canteen-items>
              @for (it of c.items; track it.name) {
                <li class="overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-950/60 transition hover:-translate-y-1 hover:border-fuchsia-300/70 hover:shadow-[0_0_30px_-8px_rgb(217_70_239_/_0.9)]" [attr.data-canteen-item]="it.name">
                  <app-food-pic class="aspect-[4/3] w-full" [path]="it.image_path" [name]="it.name" />
                  <div class="flex items-center justify-between gap-2 p-3">
                    <span class="min-w-0 truncate text-sm font-semibold">{{ it.name }}</span>
                    <span class="shrink-0 rounded-full bg-linear-to-r from-violet-600 to-fuchsia-500 px-2.5 py-0.5 text-sm font-bold text-white">₹{{ it.price }}</span>
                  </div>
                </li>
              }
            </ul>
          </div>
        </div>
      </section>
    }

    <!-- Passes (daily and monthly), only when the shop has some for sale -->
    @if (plans().length > 0) {
      <section id="passes" class="mx-auto max-w-7xl scroll-mt-20 px-4 py-8" data-passes-section>
        <div class="text-center">
          <p class="eyebrow">Passes</p>
          <h2 class="mt-1 font-display text-3xl font-bold sm:text-4xl">Play more, <span class="glow-text">pay less</span></h2>
          <p class="mt-1 text-sm text-slate-400">{{ brand().passes_intro }}</p>
        </div>
        <div class="mt-6 flex flex-wrap justify-center gap-3" data-plans>
          @for (p of plans(); track p.key) {
            <div class="card relative flex w-full flex-col gap-3 p-4 sm:w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]" [class]="p.popular ? '!border-fuchsia-400/70 shadow-[0_0_34px_-10px_rgb(217_70_239_/_0.7)]' : ''" [attr.data-plan]="p.title">
              @if (p.popular) {
                <span class="badge absolute -top-3 left-1/2 -translate-x-1/2 bg-linear-to-r from-violet-600 to-fuchsia-500 px-3 text-white" data-popular>Most popular</span>
              }
              <div class="text-center">
                <span class="mx-auto grid size-12 place-items-center rounded-xl bg-linear-to-br from-violet-500/30 to-cyan-400/20 text-violet-200"><app-icon [name]="p.icon" [size]="28" /></span>
                <p class="mt-1 font-display text-lg font-bold">{{ p.title }}</p>
                @if (p.save) {
                  <p class="mt-1 text-sm text-slate-400"><span class="line-through" data-was>₹{{ p.was }}</span>
                    <span class="badge ml-1 bg-emerald-500/20 text-emerald-300" data-save>Save {{ p.save }}%</span></p>
                }
                <p><span class="font-display text-3xl font-bold" data-price>₹{{ p.price }}</span> <span class="text-sm text-slate-400">/ {{ p.per }}</span></p>
              </div>
              <ul class="flex-1 space-y-1.5 text-sm text-slate-300">
                @for (l of p.lines; track l) {
                  <li class="flex items-start gap-2"><span class="mt-0.5 text-cyan-300"><app-icon name="check" [size]="16" /></span>{{ l }}</li>
                }
              </ul>
              <button type="button" class="flex w-full items-center justify-center gap-1.5" [class]="p.popular ? 'btn-primary' : 'btn-outline'" (click)="chooseType(p.type)" data-choose>
                Book Now @if (p.popular) { <app-icon name="arrow" [size]="16" /> }
              </button>
            </div>
          }
        </div>
        <p class="mt-3 text-center text-xs text-slate-400">Passes are bought at the counter and used when you start a session.</p>
      </section>
    }

    <!-- Booking: one compact card (choices on the left, free times on the right) so little scrolling is needed -->
    <section id="book" class="mx-auto max-w-4xl scroll-mt-20 px-4 pb-8 pt-6">
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 class="font-display text-3xl font-bold leading-none sm:text-4xl" data-book-title>Book a <span class="glow-text">slot</span></h2>
        @if (info(); as i) { <p class="text-xs text-slate-400">Times are India time. Cancel or change until {{ i.cutoff_hours }} h before.</p> }
      </div>

      @if (loadError()) {
        <p class="mt-3 text-sm text-red-400" role="alert">{{ loadError() }}</p>
      } @else if (info(); as i) {
        @if (i.types.length === 0) {
          <p class="mt-3 text-sm text-slate-400">Online booking is not open yet. Please visit the counter.</p>
        } @else {
          <div class="relative mt-3 overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-900/60 shadow-[0_24px_70px_-30px_rgb(0_0_0_/_0.9),0_0_60px_-30px_rgb(139_92_246_/_0.8),inset_0_1px_0_rgb(255_255_255_/_0.07)] backdrop-blur-xl" data-booking-card>
            <span class="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-cyan-300 to-transparent" aria-hidden="true"></span>

            <!-- the real select stays in the page (hidden) so the choice is also reachable without the buttons -->
            <select class="sr-only" data-type tabindex="-1" aria-hidden="true" (change)="type.set($any($event.target).value); reload()">
              @for (t of i.types; track t) { <option [value]="t" [selected]="t === type()">{{ label(t) }}</option> }
            </select>

            <div class="grid grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
              <div class="space-y-3">
                <div>
                  <p class="mb-1.5 text-xs font-semibold text-slate-400">Game</p>
                  <div role="radiogroup" aria-label="Game" class="flex flex-wrap gap-2" data-game-choices>
                    @for (t of i.types; track t) {
                      <button type="button" role="radio" [attr.aria-checked]="t === type()" (click)="setType(t)" [attr.data-choice]="t"
                              class="flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300"
                              [class]="t === type() ? 'border-cyan-300/80 bg-linear-to-br from-violet-600/40 to-fuchsia-600/20 shadow-[0_0_26px_-10px_rgb(34_211_238_/_0.9)]' : 'border-slate-700/70 bg-slate-950/50 hover:border-violet-300/60'">
                        <span [class]="t === type() ? 'text-cyan-200' : 'text-violet-300'"><app-icon [name]="t === 'pc' ? 'monitor' : 'gamepad'" [size]="20" /></span>
                        <span class="leading-tight">
                          <span class="block font-display text-base font-bold">{{ label(t) }}</span>
                          @if (typePrice(t); as pr) { <span class="block text-[11px] text-slate-400">{{ pr }}</span> }
                        </span>
                      </button>
                    }
                  </div>
                </div>

                <div>
                  <div class="mb-1.5 flex items-center justify-between gap-2">
                    <p class="text-xs font-semibold text-slate-400">Day</p>
                    <label class="flex items-center gap-1.5 text-[11px] text-slate-500">Other date
                      <input type="date" class="field !min-h-8 !w-auto !px-1.5 !py-0.5 text-xs" data-day [value]="day()" [min]="today" [max]="maxDay()"
                             (change)="setDay($any($event.target).value)" />
                    </label>
                  </div>
                  <div role="radiogroup" aria-label="Day" class="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1" data-day-strip>
                    @for (d of dayStrip(); track d.value) {
                      <button type="button" role="radio" [attr.aria-checked]="d.value === day()" (click)="setDay(d.value)" [attr.data-day-choice]="d.value"
                              class="flex w-14 shrink-0 snap-start flex-col items-center rounded-xl border py-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300"
                              [class]="d.value === day() ? 'border-cyan-300/80 bg-linear-to-b from-violet-600 to-fuchsia-600 text-white shadow-[0_0_22px_-8px_rgb(217_70_239_/_0.95)]' : 'border-slate-700/70 bg-slate-950/50 text-slate-300 hover:border-violet-300/60 hover:text-white'">
                        <span class="text-[10px] font-semibold leading-tight opacity-80">{{ d.top === 'Tomorrow' ? 'Tmrw' : d.top }}</span>
                        <span class="font-display text-xl font-bold leading-none">{{ d.num }}</span>
                        <span class="text-[10px] leading-tight opacity-80">{{ d.mon }}</span>
                      </button>
                    }
                  </div>
                </div>

                <div>
                  <p class="mb-1.5 text-xs font-semibold text-slate-400">Length</p>
                  <div role="radiogroup" aria-label="Length" class="flex flex-wrap gap-1.5" data-length-choices>
                    @for (n of lengths(); track n) {
                      <button type="button" role="radio" [attr.aria-checked]="n === slots()" (click)="setSlots(n)" [attr.data-length]="n"
                              class="rounded-full border px-3 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300"
                              [class]="n === slots() ? 'border-cyan-300/80 bg-cyan-300/15 text-cyan-100 shadow-[0_0_18px_-8px_rgb(34_211_238_/_0.9)]' : 'border-slate-700/70 bg-slate-950/50 text-slate-300 hover:border-violet-300/60 hover:text-white'">{{ len(n) }}</button>
                    }
                  </div>
                </div>
              </div>

              <div>
                <p class="mb-1.5 text-xs font-semibold text-slate-400">Start time</p>
                @if (loading()) {
                  <p class="sr-only" role="status">Checking free times…</p>
                  <div class="grid grid-cols-4 gap-1.5" aria-hidden="true">
                    @for (k of [1, 2, 3, 4, 5, 6, 7, 8]; track k) { <span class="h-10 animate-pulse rounded-lg bg-slate-800/70"></span> }
                  </div>
                } @else if (free().length === 0) {
                  <p class="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200" data-no-times>No free times for this choice. Try another date or length.</p>
                } @else {
                  <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-4" data-slots-grid>
                    @for (s of free(); track s.slot_start) {
                      <button type="button" data-slot (click)="pick(s)" [attr.aria-pressed]="picked() === s.slot_start"
                              class="min-h-10 rounded-lg border px-1 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300"
                              [class]="picked() === s.slot_start ? 'border-violet-300 bg-linear-to-r from-violet-600 to-fuchsia-500 text-white shadow-[0_0_22px_-6px_rgb(217_70_239_/_0.95)]' : 'border-slate-700/70 bg-slate-950/50 text-slate-200 hover:border-cyan-300/70 hover:text-white'">{{ time(s.slot_start) }}</button>
                    }
                  </div>
                }
                @if (error()) { <p class="mt-2 text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
              </div>
            </div>

            <div class="border-t border-violet-400/20 bg-slate-950/50 px-3 py-2.5 sm:px-4">
              @if (picked(); as p) {
                <div class="flex flex-wrap items-center justify-between gap-2" data-confirm>
                  <p class="text-sm">
                    <span class="font-display text-base font-bold text-cyan-300">{{ label(type()) }}</span>
                    <span class="mx-1 text-slate-600">/</span>{{ dayLabel() }}
                    <span class="mx-1 text-slate-600">/</span><span class="font-semibold">{{ time(p) }}</span>
                    <span class="mx-1 text-slate-600">/</span>{{ len(slots()) }}
                  </p>
                  <button type="button" class="btn-primary flex items-center justify-center gap-2 !px-6 !py-2 text-sm" [disabled]="busy()" (click)="confirm()" data-book>
                    {{ auth.session() ? (busy() ? 'Booking…' : 'Confirm booking') : 'Sign in to book' }}
                  </button>
                </div>
              } @else {
                <p class="text-center text-xs text-slate-400" data-pick-hint>Pick a start time to continue.</p>
              }
            </div>
          </div>
        }
      } @else {
        <p class="mt-3 text-sm text-slate-400">Loading…</p>
      }
    </section>

    <!-- Closing band -->
    <section class="px-4 pb-12">
      <div class="mx-auto flex max-w-7xl flex-col items-start gap-4 overflow-hidden rounded-2xl border border-violet-500/40 bg-linear-to-r from-violet-800/50 via-slate-900 to-slate-900 p-5 shadow-[0_0_40px_-14px_rgb(168_85_247_/_0.9)] sm:flex-row sm:items-center sm:p-6">
        <div class="w-32 shrink-0 sm:w-44"><app-controller-art /></div>
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-2xl font-bold sm:text-3xl">{{ brand().band_title }}</h2>
          <p class="mt-1 text-sm text-slate-300">{{ brand().band_text }}</p>
        </div>
        <a href="#book" class="btn-primary inline-flex shrink-0 items-center gap-2" data-band-book>Book Now <app-icon name="arrow" [size]="16" /></a>
      </div>
      <p class="mt-6 text-center text-xs text-slate-500" data-footer>{{ footerText() }} · <a routerLink="/login" class="underline hover:text-slate-300" data-staff-link>Staff login</a></p>
      <div class="mt-2"><app-legal-links /></div>
    </section>
  `,
})
export class BookHome implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly svc = inject(BookingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly clock = inject(ServerClock);

  protected readonly today = todayIst();
  protected readonly info = signal<BookingInfo | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly type = signal('');
  protected readonly day = signal(todayIst());
  protected readonly slots = signal(2);
  protected readonly free = signal<FreeSlot[]>([]);
  protected readonly picked = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly maxDay = computed(() => addDays(this.today, this.info()?.window_days ?? 7));
  protected readonly lengths = computed(() => {
    const i = this.info();
    return i ? Array.from({ length: i.max_slots - i.min_slots + 1 }, (_, k) => i.min_slots + k) : [];
  });

  private seq = 0;

  /** The shop's own wording (Admin > Settings > Branding); the built-in wording until it is loaded. */
  protected readonly brand = inject(BrandingService).brand;
  protected readonly lines = computed(() => titleLines(this.brand().shop_name));
  protected readonly taglineWords = computed(() => taglineParts(this.brand().tagline));
  protected readonly studioTitle = computed(() => glowParts(this.brand().studio_title));
  protected readonly studioText = computed(() => fillBrand(this.brand().studio_text, this.brand().shop_name, this.info()?.cutoff_hours ?? null));
  protected readonly footerText = computed(() => fillBrand(this.brand().footer, this.brand().shop_name, null));

  private static readonly FEATURE_ICONS = ['monitor', 'wifi', 'calendar', 'check'];
  protected readonly features = computed(() =>
    this.brand().features.map((f, i) => ({
      icon: BookHome.FEATURE_ICONS[i] ?? 'check',
      title: f.title,
      text: fillBrand(f.text, this.brand().shop_name, this.info()?.cutoff_hours ?? null),
    })),
  );

  protected readonly checks = computed(() => this.brand().checks);

  /** Hourly rate cards plus the passes that are for sale (real data from the shop settings). */
  protected readonly plans = computed(() => buildPlans(this.info()));
  /** The fixed-price rate card, the opening hours and the "Games available" line, all from the shop's own data. */
  protected readonly rateCard = computed(() => buildRateCard(this.info()?.packages));
  protected readonly hours = computed(() => hoursSummary(this.info()?.hours));
  protected readonly gamesText = computed(() => {
    const names = (this.info()?.types ?? []).map((t) => typeLabel(t));
    return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  });
  protected minutesText = minutesLabel;
  /** "Open now · closes 10:00 pm" / "Opens tomorrow at 12:00 pm", in India time, updated every second with the shared clock. */
  protected readonly status = computed(() => openStatus(this.info()?.hours, this.clock.now()));
  /** Which game type the games list is filtered to (null = all). */
  protected readonly gameFilter = signal<string | null>(null);
  /** The games the owner listed (hot first). Without any, the slide falls back to the PC / PS5 price tiles. */
  protected readonly posterGames = computed(() => this.info()?.games ?? []);
  protected readonly shownGames = computed(() => gamesFor(this.posterGames(), this.gameFilter()).slice(0, 8));
  protected readonly moreGames = computed(() => Math.max(0, gamesFor(this.posterGames(), this.gameFilter()).length - 8));
  protected readonly upcomingNames = computed(() => stillComing(this.info()?.upcoming, this.info()?.games).map((u) => u.title));
  protected readonly typesText = computed(() => (this.info()?.types ?? []).map((t) => typeLabel(t)).join(' · '));
  /** Changes once an hour, so the ticker's countdown words update without rebuilding the strip every second. */
  private readonly hourNow = computed(() => Math.floor(this.clock.now() / 3_600_000) * 3_600_000);
  /** The ticker lines: upcoming games first, then games marked New. */
  protected readonly ticker = computed(() => tickerItems(this.info()?.upcoming, this.info()?.games, this.hourNow()));
  /** What the label of the strip says: "Coming soon", "New games" or both. */
  protected readonly tickerTitle = computed(() => tickerLabel(this.ticker()));
  /** Copies of the list (always an even number, at least 2) so the strip is wider than the screen even with one game. */
  protected readonly tickerCopies = computed(() => {
    const n = Math.max(1, this.ticker().length);
    return Array.from({ length: 2 * Math.ceil(12 / (2 * n)) }, (_, i) => i);
  });
  /** How far the strip moves per loop: exactly one copy. */
  protected readonly tickerShift = computed(() => `-${100 / this.tickerCopies().length}%`);
  /** Seconds for one copy of the list to pass, so the speed is steady for any number of games. */
  protected readonly tickerSeconds = computed(() => {
    const chars = this.ticker().reduce((sum, it) => sum + it.text.length + 8, 0);
    return `${Math.max(10, Math.round(chars * 0.2))}s`; // about 40 pixels a second whatever the length
  });
  /** One highlight per game for the "Games available" slide. */
  protected readonly games = computed(() => gameHighlights(this.info()));
  /** The shop's clock (India time) in minutes since midnight, for the clock picture. */
  protected readonly istMinutes = computed(() => istParts(this.clock.now()).minutes);
  protected isToday(h: HoursGroup): boolean {
    return h.weekdays.includes(this.status()?.today ?? -1);
  }
  /** The canteen highlight (categories and up to 6 featured items), or nothing when the shop has none to show. */
  protected readonly canteen = computed(() => {
    const c = this.info()?.canteen;
    return c && c.items.length > 0 ? c : null;
  });
  /** Grid columns for the rate card: the game, then one column per package length. */
  protected cols(n: number): string {
    return `minmax(0,1.35fr) repeat(${n}, minmax(0,1fr))`;
  }

  /** The days to choose from, as a strip (from today to the last bookable day, at most two weeks). */
  protected readonly dayStrip = computed(() => dayChips(this.today, this.maxDay(), 14));
  protected readonly dayLabel = computed(() => dayText(this.day()));
  /** "From Rs 90 / hour" for a game type, from the shop's own prices. */
  protected typePrice(t: string): string | null {
    const g = this.games().find((x) => x.type === t);
    return g && g.price !== null ? `From ₹${g.price} / ${g.per}` : null;
  }
  protected setType(t: string): void {
    if (t === this.type()) return;
    this.type.set(t);
    void this.reload();
  }
  protected setDay(d: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < this.today || d > this.maxDay() || d === this.day()) return;
    this.day.set(d);
    void this.reload();
  }
  protected setSlots(n: number): void {
    if (n === this.slots()) return;
    this.slots.set(n);
    void this.reload();
  }

  protected chooseType(t: string | null): void {
    if (!t) {
      document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.type.set(t);
    void this.reload();
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected label = typeLabel;
  protected time = formatIstTime;
  protected len(n: number): string {
    return lengthLabel(n, this.info()?.slot_minutes ?? 30);
  }

  /**
   * A link such as /book#rates (or a click on "Rates" before the data has arrived) cannot jump to a section that is
   * not on the page yet. Once the data is in, scroll to the requested section.
   */
  private scrollToFragment(): void {
    const fragment = this.route.snapshot.fragment;
    if (!fragment) return;
    setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }), 60);
  }

  async ngOnInit(): Promise<void> {
    try {
      const i = await this.svc.info();
      this.info.set(i);
      this.scrollToFragment();
      const q = this.route.snapshot.queryParamMap;
      const t = q.get('type');
      this.type.set(t && i.types.includes(t) ? t : (i.types[0] ?? ''));
      const d = q.get('day');
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= this.today && d <= this.maxDay()) this.day.set(d);
      const n = Number(q.get('slots'));
      this.slots.set(Number.isInteger(n) && n >= i.min_slots && n <= i.max_slots ? n : Math.min(2, i.max_slots));
      await this.reload();
      const start = Number(q.get('start'));
      if (start) {
        const iso = this.free().find((s) => Date.parse(s.slot_start) === start)?.slot_start;
        if (iso) this.picked.set(iso);
      }
    } catch (e) {
      this.loadError.set((e as Error).message);
    }
  }

  protected async reload(): Promise<void> {
    if (!this.type()) return;
    const my = ++this.seq;
    this.picked.set(null);
    this.error.set(null);
    this.loading.set(true);
    try {
      const rows = await this.svc.availability(this.type(), this.day(), this.slots());
      if (my === this.seq) this.free.set(rows.filter((r) => r.free > 0));
    } catch (e) {
      if (my === this.seq) {
        this.free.set([]);
        this.error.set((e as Error).message);
      }
    } finally {
      if (my === this.seq) this.loading.set(false);
    }
  }

  protected pick(s: FreeSlot): void {
    this.picked.set(s.slot_start);
    this.error.set(null);
  }

  protected async confirm(): Promise<void> {
    const start = this.picked();
    if (!start) return;
    if (!this.auth.session()) {
      await this.router.navigate(['/book/login'], { queryParams: { next: this.resumeUrl(start) } });
      return;
    }
    if (this.auth.role() !== 'customer') {
      this.error.set('Staff accounts book from the counter.');
      return;
    }
    if (!this.auth.customer() || this.auth.needsConsent()) {
      await this.router.navigate(['/book/profile'], { queryParams: { next: this.resumeUrl(start) } });
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.book(this.type(), start, this.slots());
      await this.router.navigateByUrl('/book/my-bookings');
    } catch (e) {
      const msg = (e as Error).message;
      await this.reload(); // the slot may have just gone: show what is still free
      this.error.set(msg);
    } finally {
      this.busy.set(false);
    }
  }

  /** The /book address that restores this choice after sign-in. */
  private resumeUrl(startIso: string): string {
    const p = new URLSearchParams({
      type: this.type(),
      day: this.day(),
      slots: String(this.slots()),
      start: String(Date.parse(startIso)),
    });
    return `/book?${p.toString()}`;
  }
}
