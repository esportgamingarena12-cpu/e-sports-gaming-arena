import { chargePaise, formatDuration, packageRemainingMs, playedMs, SessionSnapshot, sessionCharge } from './pricing';

const START = '2026-01-01T10:00:00+00:00';
const at = (minutes: number): number => Date.parse(START) + minutes * 60_000;

function perHour(rate: number, over: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    rate_per_hour: rate,
    block_min: 15,
    min_bill_min: 30,
    package_minutes: null,
    package_price: null,
    started_at: START,
    paused_at: null,
    paused_seconds: 0,
    ended_at: null,
    ...over,
  };
}

function pkg(minutes: number, price: number, rate: number, over: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return perHour(rate, { package_minutes: minutes, package_price: price, ...over });
}

describe('pricing: the five worked examples (default settings)', () => {
  it('PS5 per hour 47 min -> 120', () => expect(sessionCharge(perHour(120), at(47))).toBe(120));
  it('PC per hour 10 min -> minimum 30 min = 30', () => expect(sessionCharge(perHour(60), at(10))).toBe(30));
  it('PC per hour 1h31 -> 105', () => expect(sessionCharge(perHour(60), at(91))).toBe(105));
  it('PC 3 Hours 2h50 -> within package 150', () => expect(sessionCharge(pkg(180, 150, 60), at(170))).toBe(150));
  it('PC 3 Hours 3h21 -> 150 + 30 overtime = 180', () => expect(sessionCharge(pkg(180, 150, 60), at(201))).toBe(180));
});

describe('pricing: pauses and snapshots', () => {
  it('paused time is not charged', () => {
    // 47 min elapsed, 17 paused -> 30 played -> 30 min x 120 = 60
    expect(sessionCharge(perHour(120, { paused_seconds: 17 * 60 }), at(47))).toBe(60);
  });

  it('a pause in progress stops the meter', () => {
    const s = perHour(120, { paused_at: '2026-01-01T10:30:00+00:00' });
    expect(sessionCharge(s, at(30))).toBe(sessionCharge(s, at(120)));
    expect(sessionCharge(s, at(120))).toBe(60);
  });

  it('uses the block and minimum from the snapshot', () => {
    const s = perHour(60, { block_min: 10, min_bill_min: 20 });
    expect(sessionCharge(s, at(5))).toBe(20); // minimum 20 min
    expect(sessionCharge(s, at(21))).toBe(30); // 30 min (3 blocks of 10)
  });

  it('never goes negative', () => {
    expect(playedMs(perHour(60), at(-5))).toBe(0);
  });
});

describe('pricing: boundaries and rounding', () => {
  it('exact block boundary does not round up', () => {
    expect(sessionCharge(perHour(60), at(45))).toBe(45);
    expect(sessionCharge(perHour(60), at(45) + 1000)).toBe(60); // one second into the next block
  });

  it('minimum bill applies at 0 minutes', () => {
    expect(sessionCharge(perHour(60), at(0))).toBe(30);
  });

  it('package boundary: exactly the package length is still the package price', () => {
    expect(sessionCharge(pkg(180, 150, 60), at(180))).toBe(150);
    expect(sessionCharge(pkg(180, 150, 60), at(180) + 1000)).toBe(165); // 1 s over -> one 15 min block
  });

  it('rounds half up to the paisa like Postgres (15 min at 45.50/hr = 11.38)', () => {
    expect(chargePaise(perHour(45.5, { min_bill_min: 0 }), at(15))).toBe(1138);
  });

  it('accepts numeric strings from the database', () => {
    const s: SessionSnapshot = { ...perHour(120), rate_per_hour: '120.00' };
    expect(sessionCharge(s, at(47))).toBe(120);
  });
});

describe('pricing: helpers', () => {
  it('package time left and overtime', () => {
    expect(packageRemainingMs(pkg(180, 150, 60), at(170))).toBe(10 * 60_000);
    expect(packageRemainingMs(pkg(180, 150, 60), at(201))).toBe(-21 * 60_000);
    expect(packageRemainingMs(perHour(60), at(10))).toBeNull();
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-61_000)).toBe('0:01:01');
  });
});
