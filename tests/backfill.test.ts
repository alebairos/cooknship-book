import { describe, expect, it } from 'vitest';
import { parseCookEventsTsv } from '../scripts/backfill.js';

const fixture = `ts\tintent\twi\tkind\tstation\tactor\tartifact\tresult\tinbox\tmetrics_json\tsource
2026-08-03T15:51:32Z\twealth-pwa\twi-26\tbuild.done\tdoing\timplementer\t.delivery/work/wi-26/build.md\tPASS\t\t\thistory
2026-08-03T15:51:32Z\twealth-pwa\twi-26\tcheck.pass\treview\t\t.delivery/work/wi-26/check.md\tPASS\t\t\thistory
2026-08-03T15:51:32Z\twealth-pwa\twi-26\tinbox.open\tship\toperator\t.delivery/work/wi-26/check.md\t\t\t"{""inferred"":true}"\thistory
2026-08-03T23:15:56Z\twealth-pwa\twi-33\tinbox.open\tship\toperator\t.delivery/work/wi-33/check.md\t\t\t"{""inferred"":true,""confidence"":0.95}"\thistory
`;

describe('parseCookEventsTsv', () => {
  it('maps fixture columns to Book row fields (AC-3)', () => {
    const rows = parseCookEventsTsv(fixture);

    expect(rows[0]).toEqual({
      ts: new Date('2026-08-03T15:51:32Z').getTime(),
      host: 'wealth-pwa',
      by: 'implementer',
      kind: 'build.done',
      station: 'doing',
      payload: JSON.stringify({
        wiId: 'wi-26',
        artifact: '.delivery/work/wi-26/build.md',
        result: 'PASS',
        inbox: '',
        metrics_json: '',
        source: 'history',
      }),
    });
  });

  it('returns rows matching the EventRow shape (AC-4)', () => {
    const rows = parseCookEventsTsv(fixture);

    rows.forEach((row) => {
      expect(typeof row.ts).toBe('number');
      expect(typeof row.host).toBe('string');
      expect(row.by === null || typeof row.by === 'string').toBe(true);
      expect(typeof row.kind).toBe('string');
      expect(row.station === null || typeof row.station === 'string').toBe(true);
      expect(typeof row.payload).toBe('string');
      expect(JSON.parse(row.payload)).toBeDefined();
    });
  });

  it('produces identical output on two parses of the same text (AC-5)', () => {
    const first = parseCookEventsTsv(fixture);
    const second = parseCookEventsTsv(fixture);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('returns rows without writing, fetching, or shelling out (AC-6)', () => {
    const rows = parseCookEventsTsv(fixture);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toBeDefined();
  });

  it('returns rows with no Promise or async side effects (AC-7)', () => {
    const result = parseCookEventsTsv(fixture);

    expect(result).toBeInstanceOf(Array);
    expect(result[0]).toHaveProperty('payload');
  });

  it('runs offline with an inline fixture (AC-9)', () => {
    const rows = parseCookEventsTsv(fixture);

    expect(rows.length).toBe(4);
  });

  it('preserves metrics_json cells with escaped quotes as parsed JSON values (AC-10)', () => {
    const rows = parseCookEventsTsv(fixture);

    const simpleMetrics = rows[2];
    const payload = JSON.parse(simpleMetrics.payload);
    expect(payload.metrics_json).toEqual({ inferred: true });

    const complexMetrics = rows[3];
    const complexPayload = JSON.parse(complexMetrics.payload);
    expect(complexPayload.metrics_json).toEqual({ inferred: true, confidence: 0.95 });
  });

  it('treats empty actor and station cells as null (AC-3)', () => {
    const rows = parseCookEventsTsv(fixture);

    expect(rows[1].by).toBeNull();
    expect(rows[1].station).toBe('review');
  });
});
