import { describe, expect, it } from 'vitest';
import { buildEvent, filterEventsSince, shouldAppend, verbToKind } from './events.js';

describe('events', () => {
  describe('verbToKind', () => {
    it('maps WI verbs to event kinds', () => {
      expect(verbToKind('claim')).toBe('claim');
      expect(verbToKind('renew-lease')).toBe('renew');
      expect(verbToKind('close')).toBe('close');
      expect(verbToKind('mark-ready')).toBe('mark-ready');
      expect(verbToKind('expire')).toBe('expire');
      expect(verbToKind('upsert')).toBe('upsert');
    });

    it('returns null for unknown verbs', () => {
      expect(verbToKind('admit')).toBeNull();
      expect(verbToKind('park')).toBeNull();
      expect(verbToKind('rank')).toBeNull();
    });
  });

  describe('buildEvent', () => {
    it('returns row shape with station null and JSON payload', () => {
      const row = buildEvent({
        host: 'acme',
        by: 'alice',
        kind: 'claim',
        ts: 123456789,
        wiId: 'wi-1',
        version: 7,
      });
      expect(row).toEqual({
        ts: 123456789,
        host: 'acme',
        by: 'alice',
        kind: 'claim',
        station: null,
        payload: JSON.stringify({ wiId: 'wi-1', version: 7 }),
      });
    });

    it('allows null by for system transitions', () => {
      const row = buildEvent({
        host: 'acme',
        by: null,
        kind: 'mark-ready',
        ts: 987654321,
        wiId: 'wi-2',
        version: 3,
      });
      expect(row.by).toBeNull();
      expect(row.kind).toBe('mark-ready');
    });
  });

  describe('shouldAppend', () => {
    it('returns true on success', () => {
      expect(shouldAppend(true)).toBe(true);
    });

    it('returns false on failure so failed transitions do not append', () => {
      expect(shouldAppend(false)).toBe(false);
    });
  });

  describe('filterEventsSince', () => {
    const events = [
      { seq: 1, ts: 1, host: 'acme', by: null, kind: 'upsert', station: null, payload: null },
      { seq: 3, ts: 2, host: 'acme', by: 'alice', kind: 'claim', station: null, payload: null },
      { seq: 5, ts: 3, host: 'acme', by: null, kind: 'mark-ready', station: null, payload: null },
      { seq: 7, ts: 4, host: 'acme', by: 'bob', kind: 'close', station: null, payload: null },
    ];

    it('returns all events when since is omitted', () => {
      expect(filterEventsSince(events)).toEqual(events);
    });

    it('returns events with seq strictly greater than since', () => {
      expect(filterEventsSince(events, 5)).toEqual([events[3]]);
    });

    it('orders events by seq ascending', () => {
      const shuffled = [events[2], events[0], events[3], events[1]];
      expect(filterEventsSince(shuffled)).toEqual(events);
    });

    it('returns empty array when no events match', () => {
      expect(filterEventsSince(events, 99)).toEqual([]);
    });

    it('includes events with undefined seq when since is omitted', () => {
      const row = { ts: 5, host: 'acme', by: null, kind: 'expire', station: null, payload: null };
      expect(filterEventsSince([row])).toEqual([row]);
    });
  });
});
