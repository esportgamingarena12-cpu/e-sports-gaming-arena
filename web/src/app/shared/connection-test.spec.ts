import { describe, expect, it } from 'vitest';
import { reportText, TestResult, verdict } from './connection-test';

const ok = (name: string): TestResult => ({ name, note: 'n', ok: true, status: '400', times: [120, 140] });
const bad = (name: string): TestResult => ({ name, note: 'n', ok: false, status: '2 of 3 failed', times: [300, 15000, 400], detail: 'TypeError: Failed to fetch' });

describe('connection test verdict', () => {
  it('says all is well when every check passed', () => {
    const v = verdict([ok('a'), ok('b')]);
    expect(v.good).toBe(true);
    expect(v.text).toContain('reaches the server normally');
  });
  it('names the checks that failed and says what to try', () => {
    const v = verdict([ok('a'), bad('Login service, 3 KB request')]);
    expect(v.good).toBe(false);
    expect(v.text).toContain('1 of 2 checks failed');
    expect(v.text).toContain('Login service, 3 KB request');
    expect(v.text).toContain('phone hotspot');
  });
  it('has something to say before the test has run', () => {
    expect(verdict([]).good).toBe(false);
  });
});

describe('connection test report', () => {
  it('lists every check with its times and the browser, and holds nothing private', () => {
    const t = reportText([ok('Data service'), bad('Login service')], { when: 'Thu', agent: 'Chrome/130', online: true, link: '4g, 10 Mbps, 50 ms' });
    expect(t).toContain('OK     Data service: 400 (120 ms, 140 ms)');
    expect(t).toContain('FAILED Login service: 2 of 3 failed (300 ms, 15000 ms, 400 ms) - TypeError: Failed to fetch');
    expect(t).toContain('Browser: Chrome/130');
    expect(t).toContain('link: 4g, 10 Mbps, 50 ms');
    expect(t).not.toMatch(/password|eyJ/i);
  });
});
