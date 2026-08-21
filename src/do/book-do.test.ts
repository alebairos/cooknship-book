import { describe, expect, it } from 'vitest';
import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import type { Env } from '../index.js';
import type { WorkItem } from '../domain/state-machine.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

const HOST = 'acme';
const TOKEN = 'test-token';

function wiUrl(id: string, verb: string): string {
  return `http://example.com/host/${HOST}/wis/${id}/${verb}`;
}

function wiRequest(id: string, verb: string, body: Record<string, unknown> = {}): Request {
  return new Request(wiUrl(id, verb), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json();
}

function getStub() {
  const id = env.BOOK.idFromName(HOST);
  return env.BOOK.get(id);
}

describe('BookDO WI persistence and HTTP boundary', () => {
  it('AC-2: claim transitions ready unassigned WI to doing', async () => {
    await SELF.fetch(wiRequest('wi-2', 'upsert', { payload: 'p2' }));
    const before = Date.now();

    const response = await SELF.fetch(wiRequest('wi-2', 'claim', { by: 'alice', duration: 1000 }));
    const body = (await parseJson(response)) as WorkItem;

    expect(response.status).toBe(200);
    expect(body.state).toBe('doing');
    expect(body.assignee).toBe('alice');
    expect(body.leaseExpires).toBeGreaterThanOrEqual(before + 1000);
    expect(body.version).toBe(1);
  });

  it('AC-3: claim by a different assignee returns 409 and leaves row unchanged', async () => {
    await SELF.fetch(wiRequest('wi-3', 'upsert', { payload: 'p3' }));
    await SELF.fetch(wiRequest('wi-3', 'claim', { by: 'alice', duration: 1000 }));

    const response = await SELF.fetch(wiRequest('wi-3', 'claim', { by: 'bob', duration: 1000 }));
    expect(response.status).toBe(409);

    const stub = getStub();
    const row = await runInDurableObject(stub, (instance, state) => {
      return state.storage.sql
        .exec("SELECT state, assignee, version FROM wis WHERE id = 'wi-3'")
        .toArray()[0];
    });
    expect(row).toEqual({ state: 'doing', assignee: 'alice', version: 1 });
  });

  it('AC-4: wrong expected_version returns 409 and does not mutate', async () => {
    await SELF.fetch(wiRequest('wi-4', 'upsert', { payload: 'p4' }));

    const response = await SELF.fetch(wiRequest('wi-4', 'claim', { by: 'alice', duration: 1000, expected_version: 99 }));
    expect(response.status).toBe(409);

    const stub = getStub();
    const row = await runInDurableObject(stub, (instance, state) => {
      return state.storage.sql
        .exec("SELECT state, version FROM wis WHERE id = 'wi-4'")
        .toArray()[0];
    });
    expect(row).toEqual({ state: 'ready', version: 0 });
  });

  it('AC-5: renew-lease extends the lease for the matching assignee', async () => {
    await SELF.fetch(wiRequest('wi-5', 'upsert', { payload: 'p5' }));
    await SELF.fetch(wiRequest('wi-5', 'claim', { by: 'alice', duration: 1000 }));
    const before = Date.now();

    const response = await SELF.fetch(wiRequest('wi-5', 'renew-lease', { by: 'alice', duration: 2000 }));
    const body = (await parseJson(response)) as WorkItem;

    expect(response.status).toBe(200);
    expect(body.leaseExpires).toBeGreaterThanOrEqual(before + 2000);
    expect(body.version).toBe(2);
  });

  it('AC-6: close transitions doing to done and converges idempotently', async () => {
    await SELF.fetch(wiRequest('wi-6', 'upsert', { payload: 'p6' }));
    await SELF.fetch(wiRequest('wi-6', 'claim', { by: 'alice', duration: 1000 }));

    const first = await SELF.fetch(wiRequest('wi-6', 'close', { by: 'alice', evidence: 'finished' }));
    const firstBody = (await parseJson(first)) as WorkItem;
    expect(first.status).toBe(200);
    expect(firstBody.state).toBe('done');
    expect(firstBody.evidence).toBe('finished');
    expect(firstBody.leaseExpires).toBeNull();
    expect(firstBody.version).toBe(2);

    const second = await SELF.fetch(wiRequest('wi-6', 'close', { by: 'alice', evidence: 'finished' }));
    expect(second.status).toBe(200);
    const secondBody = (await parseJson(second)) as WorkItem;
    expect(secondBody.state).toBe('done');
  });

  it('AC-7: mark-ready sets unassigned WI to ready and clears lease', async () => {
    await SELF.fetch(wiRequest('wi-7', 'upsert', { payload: 'p7' }));
    await SELF.fetch(wiRequest('wi-7', 'claim', { by: 'alice', duration: 1000 }));

    const response = await SELF.fetch(wiRequest('wi-7', 'mark-ready', {}));
    const body = (await parseJson(response)) as WorkItem;

    expect(response.status).toBe(200);
    expect(body.state).toBe('ready');
    expect(body.assignee).toBeNull();
    expect(body.leaseExpires).toBeNull();
    expect(body.version).toBe(2);
  });

  it('AC-8: expire resets doing to ready and clears assignee/lease', async () => {
    await SELF.fetch(wiRequest('wi-8', 'upsert', { payload: 'p8' }));
    await SELF.fetch(wiRequest('wi-8', 'claim', { by: 'alice', duration: 1000 }));

    const response = await SELF.fetch(wiRequest('wi-8', 'expire', {}));
    const body = (await parseJson(response)) as WorkItem;

    expect(response.status).toBe(200);
    expect(body.state).toBe('ready');
    expect(body.assignee).toBeNull();
    expect(body.leaseExpires).toBeNull();
    expect(body.version).toBe(2);
  });

  it('AC-9: upsert inserts a new ready row and rejects CAS mismatch', async () => {
    const first = await SELF.fetch(wiRequest('wi-9', 'upsert', { payload: 'p9' }));
    const firstBody = (await parseJson(first)) as WorkItem;
    expect(first.status).toBe(200);
    expect(firstBody.state).toBe('ready');
    expect(firstBody.version).toBe(0);
    expect(firstBody.payload).toBe('p9');

    const second = await SELF.fetch(wiRequest('wi-9', 'upsert', { payload: 'p9-updated', expected_version: 99 }));
    expect(second.status).toBe(409);
  });

  it('AC-10: alarm sweeps expired lease and reschedules to the next lease', async () => {
    await SELF.fetch(wiRequest('wi-10', 'upsert', { payload: 'p10' }));
    await SELF.fetch(wiRequest('wi-10', 'claim', { by: 'alice', duration: 10 }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    const stub = getStub();
    await runDurableObjectAlarm(stub);

    const row = await runInDurableObject(stub, (instance, state) => {
      return state.storage.sql
        .exec("SELECT state, assignee, lease_expires, version FROM wis WHERE id = 'wi-10'")
        .toArray()[0];
    });
    expect(row).toEqual({ state: 'ready', assignee: null, lease_expires: null, version: 2 });

    const alarm = await runInDurableObject(stub, (instance, state) => state.storage.getAlarm());
    expect(typeof alarm).toBe('number');
    expect(alarm).toBeGreaterThan(Date.now());
  });

  it('AC-11: missing bearer token returns 401 before DO is invoked', async () => {
    const request = new Request(wiUrl('wi-11', 'claim'), {
      method: 'POST',
      body: JSON.stringify({ by: 'alice', duration: 1000 }),
    });

    const response = await SELF.fetch(request);
    expect(response.status).toBe(401);

    const stub = getStub();
    const rows = await runInDurableObject(stub, (instance, state) => {
      return state.storage.sql
        .exec("SELECT id FROM wis WHERE id = 'wi-11'")
        .toArray();
    });
    expect(rows.length).toBe(0);
  });
});
