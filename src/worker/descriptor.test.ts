import { describe, expect, it } from 'vitest';
import { descriptorJson, matchRoute, routes } from '../routes.js';

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
    const boardMatch = matchRoute('GET', '/host/acme/board');
    expect(boardMatch).toBeTruthy();
    expect(boardMatch?.params.host).toBe('acme');

    const eventsMatch = matchRoute('GET', '/host/acme/events');
    expect(eventsMatch).toBeTruthy();
    expect(eventsMatch?.params.host).toBe('acme');
  });

  it('returns null for unknown routes', () => {
    expect(matchRoute('GET', '/unknown')).toBeNull();
  });

  it('descriptor includes events route as private GET', () => {
    const descriptor = JSON.parse(descriptorJson()) as Array<{ method: string; path: string; public: boolean }>;
    const eventsRoute = descriptor.find((r) => r.path === '/host/:host/events');
    expect(eventsRoute).toEqual({ method: 'GET', path: '/host/:host/events', public: false });
  });

  it('descriptor has no POST events route', () => {
    const descriptor = JSON.parse(descriptorJson()) as Array<{ method: string; path: string; public: boolean }>;
    const postEvents = descriptor.find((r) => r.path === '/host/:host/events' && r.method === 'POST');
    expect(postEvents).toBeUndefined();
  });
});
