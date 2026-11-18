import { chargePaise, customOvertimePaise, formatDuration, overtimeState, packageRemainingMs, playedMs, SessionSnapshot, sessionCharge } from './pricing';

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

describe('pricing: pass sessions (same numbers as the database tests)', () => {
  const unlimited = (over: Partial<SessionSnapshot> = {}) => perHour(60, { pass_id: 1, pass_minutes_left: null, ...over });
  const bundle = (left: number, rate = 60) => perHour(rate, { pass_id: 1, pass_minutes_left: left });

  it('an unlimited pass is free however long it runs', () => {
    expect(sessionCharge(unlimited(), at(0))).toBe(0);
    expect(sessionCharge(unlimited(), at(120))).toBe(0);
    expect(sessionCharge(unlimited(), at(600))).toBe(0);
  });
  it('an hours bundle covers time up to the balance, with no minimum bill', () => {
    expect(sessionCharge(bundle(120), at(10))).toBe(0);
    expect(sessionCharge(bundle(120), at(100))).toBe(0); // 105 rounded minutes of 120
  });
  it('time beyond the balance is billed at the hourly rate in blocks', () => {
    expect(sessionCharge(bundle(15), at(40))).toBe(30); // 45 rounded - 15 covered = 30 min x 60
    expect(sessionCharge(bundle(0), at(40))).toBe(45);
    expect(sessionCharge(bundle(15, 120), at(40))).toBe(60);
  });
  it('rounds the played time up to the billing block before taking the balance off', () => {
    expect(sessionCharge(bundle(60), at(61))).toBe(15); // 75 - 60 = 15 min
    expect(sessionCharge(bundle(60), at(60))).toBe(0);
  });
  it('pauses are not charged against a pass either', () => {
    expect(sessionCharge(bundle(30, 60), at(60))).toBe(30); // 60 elapsed
    expect(sessionCharge({ ...bundle(30, 60), paused_seconds: 30 * 60 }, at(60))).toBe(0); // 30 played
  });
  it('a pass wins over a package on the same snapshot', () => {
    expect(sessionCharge(pkg(180, 150, 60, { pass_id: 1, pass_minutes_left: null }), at(60))).toBe(0);
  });
  it('sessions without a pass are unchanged', () => {
    expect(sessionCharge(perHour(60, { pass_id: null }), at(91))).toBe(105);
  });
});

describe('pricing: an extended package session (minutes and prices added)', () => {
  // started as PC 30 min Rs 50, then a 60 min Rs 90 package was added: one session of 90 minutes for Rs 140
  const extended = pkg(90, 140, 60, { block_min: 15 });
  it('is the combined price anywhere inside the combined time', () => {
    expect(sessionCharge(extended, at(20))).toBe(140);
    expect(sessionCharge(extended, at(90))).toBe(140);
  });
  it('bills overtime beyond the combined time in blocks at the hourly rate', () => {
    expect(sessionCharge(extended, at(91))).toBe(155); // 140 + one 15 minute block at 60/hr
  });
});

describe('pricing: overtime grace on a package (30 min, Rs 50, PC at Rs 90/hr, 15 minute blocks, grace 10)', () => {
  const pc30 = (over: Partial<SessionSnapshot> = {}) => pkg(30, 50, 90, { overtime_grace_min: 10, ...over });
  it('is the package price inside the package and inside the grace', () => {
    expect(sessionCharge(pc30(), at(25))).toBe(50);
    expect(sessionCharge(pc30(), at(30))).toBe(50);
    expect(sessionCharge(pc30(), at(35))).toBe(50); // 5 over
    expect(sessionCharge(pc30(), at(40))).toBe(50); // exactly 10 over
  });
  it('charges a 15 minute block once the grace is passed (11 to 15 minutes over)', () => {
    expect(sessionCharge(pc30(), at(41))).toBe(72.5); // 50 + 22.50
    expect(sessionCharge(pc30(), at(45))).toBe(72.5);
  });
  it('charges 30 minutes from 16 minutes over', () => {
    expect(sessionCharge(pc30(), at(46))).toBe(95); // 50 + 45
    expect(sessionCharge(pc30(), at(60))).toBe(95);
    expect(sessionCharge(pc30(), at(61))).toBe(117.5); // 31 over: 3 blocks
  });
  it('the example from the counter: 31 min 43 s played is free with the grace', () => {
    expect(chargePaise(pc30(), Date.parse(START) + (31 * 60 + 43) * 1000)).toBe(5000);
  });
  it("staff can charge overtime inside the grace ('charge')", () => {
    expect(sessionCharge(pc30({ overtime_mode: 'charge' }), at(35))).toBe(72.5);
  });
  it("staff can waive overtime beyond the grace ('waive')", () => {
    expect(sessionCharge(pc30({ overtime_mode: 'waive' }), at(120))).toBe(50);
  });
  it('a session with no grace value behaves as before (every overtime is charged)', () => {
    expect(sessionCharge(pkg(30, 50, 90), at(31))).toBe(72.5);
    expect(sessionCharge(pkg(30, 50, 90, { overtime_grace_min: 0 }), at(31))).toBe(72.5);
  });
  it('per-hour and pass sessions are not affected by the grace', () => {
    expect(sessionCharge(perHour(60, { overtime_grace_min: 10 }), at(91))).toBe(105);
    expect(sessionCharge(perHour(60, { pass_id: 1, pass_minutes_left: 30, overtime_grace_min: 10 }), at(50))).toBe(30); // 60 min rounded up, 30 beyond the balance
  });
  it('an extended package (90 min, Rs 140) uses the grace after the new total', () => {
    const extended = pkg(90, 140, 90, { overtime_grace_min: 10 });
    expect(sessionCharge(extended, at(100))).toBe(140);
    expect(sessionCharge(extended, at(101))).toBe(162.5);
  });
});

describe('overtimeState (what the counter shows)', () => {
  const pc30 = (over: Partial<SessionSnapshot> = {}) => pkg(30, 50, 90, { overtime_grace_min: 10, ...over });
  it('is null inside the package, for per-hour and for pass sessions', () => {
    expect(overtimeState(pc30(), at(20))).toBeNull();
    expect(overtimeState(perHour(60), at(200))).toBeNull();
    expect(overtimeState(pc30({ pass_id: 3 }), at(60))).toBeNull();
  });
  it('inside the grace: free, with the amount it would cost', () => {
    const o = overtimeState(pc30(), at(34) + 30_000)!;
    expect(o).toMatchObject({ overMinutes: 5, charged: false, withinGrace: true, ifChargedRupees: 22.5, mode: null });
  });
  it('beyond the grace: charged', () => {
    expect(overtimeState(pc30(), at(46))).toMatchObject({ overMinutes: 16, charged: true, withinGrace: false, ifChargedRupees: 45 });
  });
  it("shows staff's choice", () => {
    expect(overtimeState(pc30({ overtime_mode: 'charge' }), at(35))).toMatchObject({ charged: true, mode: 'charge' });
    expect(overtimeState(pc30({ overtime_mode: 'waive' }), at(90))).toMatchObject({ charged: false, mode: 'waive' });
  });
});

describe('pricing: a custom overtime amount typed by staff (inside the grace only)', () => {
  const pc30 = (over: Partial<SessionSnapshot> = {}) => pkg(30, 50, 90, { overtime_grace_min: 10, ...over });
  it('replaces the block charge while the overtime is inside the grace', () => {
    expect(sessionCharge(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), at(36))).toBe(60); // 6 min over: 50 + 10
    expect(sessionCharge(pc30({ overtime_mode: 'charge', overtime_amount: '12.50' }), at(40))).toBe(62.5); // exactly 10 over
  });
  it('can be zero', () => {
    expect(sessionCharge(pc30({ overtime_mode: 'charge', overtime_amount: 0 }), at(36))).toBe(50);
  });
  it('stops applying beyond the grace: the normal block charge takes over, so a long overtime is not undercharged', () => {
    expect(sessionCharge(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), at(41))).toBe(72.5); // 11 over
    expect(sessionCharge(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), at(46))).toBe(95); // 16 over
  });
  it('is ignored unless the choice is Charge', () => {
    expect(sessionCharge(pc30({ overtime_mode: null, overtime_amount: 10 }), at(36))).toBe(50);
    expect(sessionCharge(pc30({ overtime_mode: 'waive', overtime_amount: 10 }), at(36))).toBe(50);
  });
  it('is not used when there is no amount: charging uses the block price', () => {
    expect(sessionCharge(pc30({ overtime_mode: 'charge' }), at(36))).toBe(72.5);
  });
  it('customOvertimePaise gives the amount in paise only when it applies', () => {
    expect(customOvertimePaise(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), 6 * 60_000)).toBe(1000);
    expect(customOvertimePaise(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), 11 * 60_000)).toBeNull();
    expect(customOvertimePaise(pc30(), 6 * 60_000)).toBeNull();
  });
  it('overtimeState says when a typed amount has run past the grace and no longer applies', () => {
    const o = overtimeState(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), at(45))!;
    expect(o).toMatchObject({ customExpired: true, customRupees: null, typedRupees: 10, charged: true, ifChargedRupees: 22.5 });
    expect(overtimeState(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), at(36))!.customExpired).toBe(false);
    expect(overtimeState(pc30(), at(45))!.customExpired).toBe(false);
  });
  it('overtimeState shows the custom amount', () => {
    const o = overtimeState(pc30({ overtime_mode: 'charge', overtime_amount: 10 }), at(36))!;
    expect(o).toMatchObject({ charged: true, customRupees: 10, ifChargedRupees: 22.5, withinGrace: true });
    expect(overtimeState(pc30(), at(36))!.customRupees).toBeNull();
  });
});
