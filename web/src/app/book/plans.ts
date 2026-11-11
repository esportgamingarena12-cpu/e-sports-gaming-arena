import { BookingInfo, PublicPass } from './booking.service';
import { typeLabel } from './portal';

export interface Plan {
  key: string;
  title: string;
  icon: string;
  price: number;
  per: string;
  lines: string[];
  popular: boolean;
  /** The game type to preselect when "Book Now" is pressed (null = keep the current choice). */
  type: string | null;
}

const num = (n: number | string): number => Number(n);

/** "20 h", "1 h 30 min" */
export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "day", "7 days" */
export const perText = (days: number): string => (days === 1 ? 'day' : `${days} days`);

export function passPlan(p: PublicPass): Plan {
  return {
    key: `pass:${p.name}`,
    title: p.name,
    icon: p.kind === 'unlimited' ? 'trophy' : 'clock',
    price: num(p.price),
    per: perText(p.validity_days),
    lines: [
      p.kind === 'unlimited' ? 'Unlimited play' : `${hoursText(p.minutes_total ?? 0)} of play`,
      `Valid for ${p.validity_days} day${p.validity_days === 1 ? '' : 's'}`,
      p.station_type ? `${typeLabel(p.station_type)} stations` : 'All PCs and consoles',
      'Bought at the counter',
    ],
    popular: p.popular,
    type: p.station_type,
  };
}

/** The hourly rate of each game, then the passes, cheapest first. Nothing is invented: no data, no card. */
export function buildPlans(info: BookingInfo | null): Plan[] {
  if (!info) return [];
  const rates: Plan[] = (info.rates ?? []).map((r) => ({
    key: `rate:${r.type}`,
    title: `${typeLabel(r.type)} by the hour`,
    icon: r.type === 'pc' ? 'monitor' : 'gamepad',
    price: num(r.rate_per_hour),
    per: 'hour',
    lines: [`Play on any ${typeLabel(r.type)} station`, 'Billed by the minute, rounded up to a fair block', 'Pay at the counter'],
    popular: false,
    type: r.type,
  }));
  const passes = (info.passes ?? []).map(passPlan);
  return [...rates, ...passes];
}
