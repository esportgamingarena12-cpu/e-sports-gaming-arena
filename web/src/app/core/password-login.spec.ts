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
    expect(signUpError('User already registered')).toContain('already has an account');
    expect(signUpError('A user with this email address has already been registered')).toContain('Sign in instead');
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
