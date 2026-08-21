import { describe, expect, it } from 'vitest';
import { bearerOk } from '../src/auth.js';

function requestWithAuth(auth?: string): Request {
  const headers = auth ? { Authorization: auth } : {};
  return new Request('http://example.com/', { headers });
}

describe('bearerOk', () => {
  it('rejects missing Authorization header', () => {
    expect(bearerOk(requestWithAuth(), 'token')).toBe(false);
  });

  it('rejects invalid scheme', () => {
    expect(bearerOk(requestWithAuth('Basic token'), 'token')).toBe(false);
  });

  it('rejects wrong token', () => {
    expect(bearerOk(requestWithAuth('Bearer wrong'), 'token')).toBe(false);
  });

  it('accepts matching bearer token', () => {
    expect(bearerOk(requestWithAuth('Bearer token'), 'token')).toBe(true);
  });
});
