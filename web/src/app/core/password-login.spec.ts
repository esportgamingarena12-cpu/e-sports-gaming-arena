import { describe, expect, it } from 'vitest';
import { passwordProblem, passwordsMatch, shouldEndSession, signInError, signUpError } from './password-login';

describe('password rules', () => {
  it('accepts a normal password', () => {
    expect(passwordProblem('Gaming2026')).toBeNull();
    expect(passwordProblem('abc12345')).toBeNull();
  });
  it('needs at least 8 characters', () => {
    expect(passwordProblem('abc123')).toContain('at least 8');
    expect(passwordProblem('')).toContain('at least 8');
    expect(passwordProblem('abcd123')).toContain('at least 8');
  });
  it('needs letters and a number', () => {
    expect(passwordProblem('abcdefghij')).toContain('letters and at least one number');
    expect(passwordProblem('1234567890')).toContain('letters and at least one number');
  });
  it('refuses a password longer than 72 bytes', () => {
    expect(passwordProblem('a1'.repeat(36))).toBeNull(); // 72 characters
    expect(passwordProblem('a1'.repeat(37))).toContain('at most 72');
    expect(passwordProblem('é1'.repeat(30))).toContain('at most 72'); // 2 bytes per é: 90 bytes
  });
  it('refuses the email (or the part before the @) as the password', () => {
    expect(passwordProblem('player1234', 'player1234@gmail.com')).toContain('cannot be your email');
    expect(passwordProblem('Player1234@Gmail.com', 'player1234@gmail.com')).toContain('cannot be your email');
    expect(passwordProblem('Another2026', 'player1234@gmail.com')).toBeNull();
  });
  it('checks the two passwords are the same', () => {
    expect(passwordsMatch('Gaming2026', 'Gaming2026')).toBe(true);
    expect(passwordsMatch('Gaming2026', 'gaming2026')).toBe(false);
    expect(passwordsMatch('', '')).toBe(false);
    expect(passwordsMatch('abc', '')).toBe(false);
  });
});

describe('error messages', () => {
  it('sign up: an existing email points to sign in or Google', () => {
    // the wording must not confirm that the email is registered
    expect(signUpError('User already registered')).toContain('could not create an account');
    expect(signUpError('User already registered')).not.toMatch(/already has an account|already registered/i);
    expect(signUpError('A user with this email address has already been registered')).toMatch(/sign in instead/i);
    expect(signUpError('user_already_exists')).toContain('Google');
  });
  it('sign up: rate limits, weak passwords, bad emails, switched-off sign ups', () => {
    expect(signUpError('email rate limit exceeded')).toContain('Too many attempts');
    expect(signUpError('Password should be at least 6 characters')).toContain('stronger password');
    expect(signUpError('Unable to validate email address: invalid format')).toContain('valid email');
    expect(signUpError('Signups not allowed for this instance')).toContain('switched off');
  });
  it('sign up: anything else gets a safe message, never the raw text', () => {
    const m = signUpError('relation "profiles" does not exist');
    expect(m).toBe('Sign up did not work. Please try again.');
    expect(signUpError(null)).toBe('Sign up did not work. Please try again.');
  });
  it('sign in: wrong details, unconfirmed email, rate limits, anything else', () => {
    expect(signInError('Invalid login credentials')).toBe('Wrong email or password');
    expect(signInError('Email not confirmed')).toContain('confirm your email');
    expect(signInError('Request rate limit reached')).toContain('Too many attempts');
    expect(signInError('weird internal thing')).toBe('Sign in did not work. Please try again.');
  });
});

describe('remember me', () => {
  it('ends the login only for someone who unticked it, on a new browser session', () => {
    expect(shouldEndSession('0', null)).toBe(true);
    expect(shouldEndSession('0', '0')).toBe(true);
  });
  it('keeps the login while the same browser session continues', () => {
    expect(shouldEndSession('0', '1')).toBe(false);
  });
  it('keeps the login of anyone who stayed ticked, or never chose', () => {
    expect(shouldEndSession('1', null)).toBe(false);
    expect(shouldEndSession(null, null)).toBe(false);
    expect(shouldEndSession(undefined, undefined)).toBe(false);
  });
});

import { changePasswordError, changePasswordProblem } from './password-login';
describe('changing the password', () => {
  const ok = (cur: string, next: string, conf: string, has = true) => changePasswordProblem(cur, next, conf, 'a@b.in', has);
  it('needs the current password when the account has one', () => {
    expect(ok('', 'Newpass123', 'Newpass123')).toBe('Enter your current password');
  });
  it('does not need it for a Google-only account', () => {
    expect(ok('', 'Newpass123', 'Newpass123', false)).toBeNull();
  });
  it('applies the usual password rules to the new one', () => {
    expect(ok('Oldpass1', 'short1', 'short1')).toMatch(/at least 8/);
    expect(ok('Oldpass1', 'onlyletters', 'onlyletters')).toMatch(/letters and at least one number/);
  });
  it('refuses the same password again', () => {
    expect(ok('Samepass1', 'Samepass1', 'Samepass1')).toMatch(/different/);
  });
  it('refuses two new passwords that differ', () => {
    expect(ok('Oldpass1', 'Newpass123', 'Newpass124')).toMatch(/do not match/);
  });
  it('accepts a good change', () => {
    expect(ok('Oldpass1', 'Newpass123', 'Newpass123')).toBeNull();
  });
  it('turns server errors into plain language', () => {
    expect(changePasswordError('New password should be different from the old password.')).toMatch(/different/);
    expect(changePasswordError('Password should be at least 8 characters')).toMatch(/stronger/);
    expect(changePasswordError('weird')).toMatch(/could not be changed/);
  });
});
