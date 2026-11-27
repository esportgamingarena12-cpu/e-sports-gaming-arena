// Run with: node --test supabase/functions/secure-login/client-ip.test.ts   (Node 24 or newer runs TypeScript directly)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, sameSecret } from './client-ip.ts';

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test('normally the address Supabase saw is used', () => {
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.2.3.4' }), 's3cret'), '1.2.3.4');
  assert.equal(clientIp(h({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }), 's3cret'), '5.6.7.8');
  assert.equal(clientIp(h({}), 's3cret'), 'unknown');
});

test('through the shop door (right secret) the address it reports is used', () => {
  assert.equal(clientIp(h({ 'cf-connecting-ip': '172.64.0.1', 'x-client-ip': '106.1.2.3', 'x-proxy-secret': 's3cret' }), 's3cret'), '106.1.2.3');
});

test('a visitor cannot pretend to be another address: x-client-ip without the right secret is ignored', () => {
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.2.3.4', 'x-client-ip': '8.8.8.8' }), 's3cret'), '1.2.3.4');
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.2.3.4', 'x-client-ip': '8.8.8.8', 'x-proxy-secret': 'wrong' }), 's3cret'), '1.2.3.4');
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.2.3.4', 'x-client-ip': '8.8.8.8', 'x-proxy-secret': 's3cre' }), 's3cret'), '1.2.3.4');
});

test('with no secret set on the function, the shop door header is never believed', () => {
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.2.3.4', 'x-client-ip': '8.8.8.8', 'x-proxy-secret': '' }), ''), '1.2.3.4');
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.2.3.4', 'x-client-ip': '8.8.8.8', 'x-proxy-secret': 'x' }), undefined), '1.2.3.4');
});

test('through the door but without a reported address, it falls back to what Supabase saw', () => {
  assert.equal(clientIp(h({ 'cf-connecting-ip': '172.64.0.1', 'x-proxy-secret': 's3cret' }), 's3cret'), '172.64.0.1');
});

test('addresses are cut to a safe length', () => {
  assert.equal(clientIp(h({ 'x-client-ip': 'a'.repeat(200), 'x-proxy-secret': 's3cret' }), 's3cret').length, 64);
});

test('sameSecret', () => {
  assert.equal(sameSecret('abc', 'abc'), true);
  assert.equal(sameSecret('abc', 'abd'), false);
  assert.equal(sameSecret('abc', 'abcd'), false);
  assert.equal(sameSecret('', ''), true);
});
