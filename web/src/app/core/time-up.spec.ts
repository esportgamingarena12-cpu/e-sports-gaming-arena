import { describe, expect, it } from 'vitest';
import { alarmKey, alarmLimitMs, alarmRemainingMs, AlarmSnapshot, dueAlarms, isTimeUp, overText } from './time-up';

const T0 = Date.parse('2026-11-16T10:00:00Z');
const min = (n: number) => n * 60_000;

const session = (over: Partial<AlarmSnapshot> = {}): AlarmSnapshot => ({
  id: 1,
  status: 'running',
  rate_per_hour: 110,
  block_min: 15,
  min_bill_min: 30,
  package_minutes: null,
  package_price: null,
  started_at: new Date(T0).toISOString(),
  paused_at: null,
  paused_seconds: 0,
  ended_at: null,
  alarm_minutes: null,
  alarm_extra_minutes: 0,
  ...over,
});

describe('alarm time', () => {
  it('a package session rings at its package length', () => {
    expect(alarmLimitMs(session({ package_minutes: 60, package_price: 110 }))).toBe(min(60));
  });
  it('an hourly session rings at its timer, if it has one', () => {
    expect(alarmLimitMs(session({ alarm_minutes: 45 }))).toBe(min(45));
    expect(alarmLimitMs(session())).toBeNull();
  });
  it('the package length wins over a stray timer', () => {
    expect(alarmLimitMs(session({ package_minutes: 30, alarm_minutes: 90 }))).toBe(min(30));
  });
  it('an extension moves the alarm later', () => {
    expect(alarmLimitMs(session({ alarm_minutes: 60, alarm_extra_minutes: 15 }))).toBe(min(75));
    expect(alarmLimitMs(session({ package_minutes: 30, alarm_extra_minutes: 30 }))).toBe(min(60));
  });
  it('a zero or missing length is no alarm', () => {
    expect(alarmLimitMs(session({ alarm_minutes: 0 }))).toBeNull();
    expect(alarmLimitMs(session({ alarm_minutes: undefined }))).toBeNull();
  });
});

describe('time is up', () => {
  const s = session({ alarm_minutes: 60 });
  it('is false before the time, true at and after it', () => {
    expect(isTimeUp(s, T0 + min(59))).toBe(false);
    expect(isTimeUp(s, T0 + min(60))).toBe(true);
    expect(isTimeUp(s, T0 + min(75))).toBe(true);
  });
  it('is false for a session with no alarm', () => {
    expect(isTimeUp(session(), T0 + min(600))).toBe(false);
  });
  it('is false for a paused or ended session', () => {
    expect(isTimeUp(session({ alarm_minutes: 60, status: 'paused' }), T0 + min(120))).toBe(false);
    expect(isTimeUp(session({ alarm_minutes: 60, status: 'ended' }), T0 + min(120))).toBe(false);
  });
  it('counts played time, so earlier pauses push the alarm back', () => {
    const paused10 = session({ alarm_minutes: 60, paused_seconds: 600 });
    expect(isTimeUp(paused10, T0 + min(65))).toBe(false);
    expect(isTimeUp(paused10, T0 + min(70))).toBe(true);
  });
  it('remaining time is negative once past the alarm', () => {
    expect(alarmRemainingMs(s, T0 + min(50))).toBe(min(10));
    expect(alarmRemainingMs(s, T0 + min(65))).toBe(-min(5));
    expect(alarmRemainingMs(session(), T0)).toBeNull();
  });
});

describe('alerts to show', () => {
  const a = session({ id: 1, alarm_minutes: 60 });
  const b = session({ id: 2, alarm_minutes: 30 });
  const c = session({ id: 3 });

  it('lists only sessions whose time is up, longest overdue first', () => {
    expect(dueAlarms([a, b, c], T0 + min(65), new Set()).map((x) => x.id)).toEqual([2, 1]);
    expect(dueAlarms([a, b, c], T0 + min(40), new Set()).map((x) => x.id)).toEqual([2]);
  });
  it('hides a dismissed alert', () => {
    expect(dueAlarms([a, b], T0 + min(65), new Set([alarmKey(b)])).map((x) => x.id)).toEqual([1]);
  });
  it('rings again after an extension, because the key changes', () => {
    const dismissed = new Set([alarmKey(b)]);
    const extended = { ...b, alarm_extra_minutes: 15 };
    expect(alarmKey(extended)).not.toBe(alarmKey(b));
    expect(dueAlarms([extended], T0 + min(40), dismissed)).toEqual([]); // 40 < 45
    expect(dueAlarms([extended], T0 + min(46), dismissed).map((x) => x.id)).toEqual([2]);
  });
});

describe('overdue text', () => {
  it('describes how late it is', () => {
    expect(overText(-5_000)).toBe('just now');
    expect(overText(0)).toBe('just now');
    expect(overText(-min(2))).toBe('2 min over');
    expect(overText(-min(65))).toBe('1 h 05 min over');
    expect(overText(min(3))).toBe('just now');
  });
});
