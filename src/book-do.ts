import { DurableObject } from 'cloudflare:workers';
import { applyPending, MIGRATION_FILES } from './migrations.js';
import { matchRoute } from './routes.js';
import {
  claim,
  close,
  expire,
  markReady,
  renewLease,
  type DomainResult,
  type WiState,
  type WorkItem,
} from './domain/state-machine.js';

const WI_ROUTES = new Set([
  '/host/:host/wis/:id/claim',
  '/host/:host/wis/:id/renew-lease',
  '/host/:host/wis/:id/expire',
  '/host/:host/wis/:id/close',
  '/host/:host/wis/:id/mark-ready',
  '/host/:host/wis/:id/upsert',
]);

function isWiRoute(path: string): boolean {
  return WI_ROUTES.has(path);
}

function rowToItem(row: Record<string, unknown>): WorkItem {
  return {
    id: row.id as string,
    state: row.state as WiState,
    assignee: row.assignee as string | null,
    leaseExpires: row.lease_expires === null || row.lease_expires === undefined ? null : Number(row.lease_expires),
    version: Number(row.version),
    payload: row.payload === null || row.payload === undefined ? undefined : String(row.payload),
  };
}

export class BookDO extends DurableObject {
  private readonly state: DurableObjectState;
  private readonly sqlExec: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;

  constructor(state: DurableObjectState, env: unknown) {
    super(state, env);
    this.state = state;
    this.sqlExec = (sql, params) => state.storage.sql.exec(sql, ...(params ?? [])).toArray();
    applyPending(this.sqlExec, MIGRATION_FILES);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = matchRoute(request.method, url.pathname);
    if (!match) return new Response('Not Found', { status: 404 });

    const { route, params } = match;
    if (!isWiRoute(route.path)) return new Response('Not Implemented', { status: 501 });

    const host = params.host;
    const id = params.id;
    if (!host || !id) return new Response('Not Found', { status: 404 });

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // empty body is allowed
    }

    const now = Date.now();
    let result: DomainResult;

    if (route.path.endsWith('/upsert')) {
      result = this.upsert(host, id, body);
    } else {
      const item = this.loadWi(host, id);
      if (!item) return new Response('Not Found', { status: 404 });
      result = this.applyTransition(item, route.path, body, now);
    }

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.code }), { status: 409 });
    }

    this.persistWi(host, result.item);
    if (result.item.leaseExpires !== null) {
      await this.scheduleAlarmIfSooner(result.item.leaseExpires);
    }
    return new Response(JSON.stringify(result.item), { status: 200 });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const rows = this.sqlExec(
      `SELECT id, host, state, assignee, lease_expires, version, payload FROM wis WHERE state = 'doing' AND lease_expires <= ?`,
      [now],
    );

    for (const row of rows) {
      const item = rowToItem(row);
      const result = expire(item, now);
      if (result.ok) {
        this.persistWi(row.host as string, result.item);
      }
    }

    await this.rescheduleAlarm();
  }

  private upsert(host: string, id: string, body: Record<string, unknown>): DomainResult {
    const existing = this.loadWi(host, id);
    const payload = body.payload === undefined ? undefined : String(body.payload);

    if (!existing) {
      const newItem: WorkItem = {
        id,
        state: 'ready',
        assignee: null,
        leaseExpires: null,
        version: 0,
        payload,
      };
      return { ok: true, item: newItem };
    }

    const expectedVersion = body.expected_version === undefined ? undefined : Number(body.expected_version);
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      return { ok: false, code: 'cas' };
    }

    return {
      ok: true,
      item: {
        ...existing,
        payload,
        version: existing.version + 1,
      },
    };
  }

  private applyTransition(
    item: WorkItem,
    routePath: string,
    body: Record<string, unknown>,
    now: number,
  ): DomainResult {
    const verb = routePath.split('/').pop();
    const by = body.by === undefined ? undefined : String(body.by);
    const duration = body.duration === undefined ? undefined : Number(body.duration);
    const evidence = body.evidence === undefined ? undefined : String(body.evidence);
    const expectedVersion = body.expected_version === undefined ? undefined : Number(body.expected_version);

    switch (verb) {
      case 'claim':
        if (by === undefined || duration === undefined) return { ok: false, code: 'illegal' };
        return claim(item, by, duration, now, expectedVersion);
      case 'renew-lease':
        if (by === undefined || duration === undefined) return { ok: false, code: 'illegal' };
        return renewLease(item, by, duration, now, expectedVersion);
      case 'expire':
        return expire(item, now, expectedVersion);
      case 'close':
        if (by === undefined || evidence === undefined) return { ok: false, code: 'illegal' };
        return close(item, by, evidence, now, expectedVersion);
      case 'mark-ready':
        return markReady(item, now, expectedVersion);
      default:
        return { ok: false, code: 'illegal' };
    }
  }

  private loadWi(host: string, id: string): WorkItem | null {
    const rows = this.sqlExec(
      `SELECT id, host, state, assignee, lease_expires, version, payload FROM wis WHERE id = ? AND host = ?`,
      [id, host],
    );
    if (rows.length === 0) return null;
    return rowToItem(rows[0]);
  }

  private persistWi(host: string, item: WorkItem): void {
    this.sqlExec(
      `INSERT INTO wis (id, host, state, assignee, lease_expires, version, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         state = excluded.state,
         assignee = excluded.assignee,
         lease_expires = excluded.lease_expires,
         version = excluded.version,
         payload = excluded.payload`,
      [item.id, host, item.state, item.assignee, item.leaseExpires, item.version, item.payload ?? null],
    );
  }

  private async scheduleAlarmIfSooner(leaseExpires: number): Promise<void> {
    const existing = await this.state.storage.getAlarm();
    if (existing === null || leaseExpires < existing) {
      await this.state.storage.setAlarm(leaseExpires);
    }
  }

  private async rescheduleAlarm(): Promise<void> {
    const rows = this.sqlExec(
      `SELECT MIN(lease_expires) as next FROM wis WHERE state = 'doing' AND lease_expires IS NOT NULL`,
    );
    const next = rows[0]?.next as number | null | undefined;
    if (next === null || next === undefined) {
      await this.state.storage.deleteAlarm();
    } else {
      await this.state.storage.setAlarm(next);
    }
  }
}
