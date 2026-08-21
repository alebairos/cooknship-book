import { describe, expect, it } from 'vitest';
import { descriptorJson, matchRoute, routes } from '../src/routes.js';

describe('routes', () => {
  it('descriptor lists every registered route', () => {
    const descriptor = JSON.parse(descriptorJson());
    expect(descriptor.length).toBe(routes.length);
    expect(descriptor.every((r: { public: boolean }) => typeof r.public === 'boolean')).toBe(true);
  });

  it('matches public routes', () => {
    expect(matchRoute('GET', '/descriptor')).toBeTruthy();
    expect(matchRoute('GET', '/')).toBeTruthy();
  });

  it('matches host routes with params', () => {
    const match = matchRoute('GET', '/host/acme/board');
    expect(match).toBeTruthy();
    expect(match?.params.host).toBe('acme');
  });

  it('returns null for unknown routes', () => {
    expect(matchRoute('GET', '/unknown')).toBeNull();
  });
});
