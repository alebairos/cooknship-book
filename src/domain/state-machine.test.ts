import { describe, expect, it } from 'vitest';
import {
  claim,
  close,
  expire,
  markReady,
  renewLease,
  type WorkItem,
} from './state-machine.js';

function item(overrides?: Partial<WorkItem>): WorkItem {
  return {
    id: 'wi-1',
    state: 'ready',
    assignee: null,
    leaseExpires: null,
    version: 1,
    ...overrides,
  };
}

describe('claim', () => {
  it('AC-2: claims a ready unassigned work item', () => {
    const result = claim(item(), 'alice', 60, 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.state).toBe('doing');
    expect(result.item.assignee).toBe('alice');
    expect(result.item.leaseExpires).toBe(1060);
    expect(result.item.version).toBe(2);
  });

  it('AC-3: re-claim by the same assignee is idempotent', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = claim(doing, 'alice', 60, 1000);

    expect(result).toEqual({ ok: true, item: doing });
  });

  it('AC-4: claim by a different assignee returns conflict', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = claim(doing, 'bob', 60, 1000);

    expect(result).toEqual({ ok: false, code: 'conflict' });
  });

  it('AC-5: mismatched expected version on claim returns CAS error', () => {
    const result = claim(item({ version: 3 }), 'alice', 60, 1000, 2);

    expect(result).toEqual({ ok: false, code: 'cas' });
  });

  it('idempotent re-claim does not fail even with a stale CAS', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = claim(doing, 'alice', 60, 1000, 1);

    expect(result).toEqual({ ok: true, item: doing });
  });
});

describe('expire', () => {
  it('AC-6: expire doing resets to ready and clears lease', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 900, version: 2 });
    const result = expire(doing, 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.state).toBe('ready');
    expect(result.item.assignee).toBeNull();
    expect(result.item.leaseExpires).toBeNull();
    expect(result.item.version).toBe(3);
  });

  it('AC-7: expire on ready is idempotent', () => {
    const ready = item({ state: 'ready', version: 3 });
    const result = expire(ready, 1000);

    expect(result).toEqual({ ok: true, item: ready });
  });

  it('AC-5: mismatched expected version on expire returns CAS error', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 900, version: 2 });
    const result = expire(doing, 1000, 1);

    expect(result).toEqual({ ok: false, code: 'cas' });
  });
});

describe('close', () => {
  it('AC-8: close doing with matching assignee sets done and evidence', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = close(doing, 'alice', 'finished', 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.state).toBe('done');
    expect(result.item.evidence).toBe('finished');
    expect(result.item.leaseExpires).toBeNull();
    expect(result.item.version).toBe(3);
  });

  it('AC-9: close on done is idempotent', () => {
    const done = item({ state: 'done', assignee: 'alice', evidence: 'finished', version: 3 });
    const result = close(done, 'alice', 'finished', 1000);

    expect(result).toEqual({ ok: true, item: done });
  });

  it('AC-5: mismatched expected version on close returns CAS error', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = close(doing, 'alice', 'finished', 1000, 1);

    expect(result).toEqual({ ok: false, code: 'cas' });
  });
});

describe('renewLease', () => {
  it('AC-10: renewLease extends the lease for the matching assignee', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = renewLease(doing, 'alice', 120, 2000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.leaseExpires).toBe(2120);
    expect(result.item.version).toBe(3);
  });

  it('AC-5: mismatched expected version on renewLease returns CAS error', () => {
    const doing = item({ state: 'doing', assignee: 'alice', leaseExpires: 1060, version: 2 });
    const result = renewLease(doing, 'alice', 120, 2000, 1);

    expect(result).toEqual({ ok: false, code: 'cas' });
  });
});

describe('markReady', () => {
  it('returns the ready item idempotently when already unassigned and ready', () => {
    const ready = item({ state: 'ready', version: 1 });
    const result = markReady(ready, 1000);

    expect(result).toEqual({ ok: true, item: ready });
  });

  it('transitions a stale item back to ready with cleared lease', () => {
    const stale = item({ state: 'doing', assignee: 'alice', leaseExpires: 900, version: 2 });
    const result = markReady(stale, 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.state).toBe('ready');
    expect(result.item.assignee).toBeNull();
    expect(result.item.leaseExpires).toBeNull();
    expect(result.item.version).toBe(3);
  });
});
