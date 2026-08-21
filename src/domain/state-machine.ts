export type WiState = 'ready' | 'doing' | 'done';

export type WorkItem = {
  id: string;
  state: WiState;
  assignee: string | null;
  leaseExpires: number | null;
  version: number;
  evidence?: string;
};

export type DomainError = { ok: false; code: 'conflict' | 'cas' | 'illegal' };
export type DomainOk = { ok: true; item: WorkItem };
export type DomainResult = DomainOk | DomainError;

function casOk(item: WorkItem, expectedVersion?: number): boolean {
  return expectedVersion === undefined || item.version === expectedVersion;
}

function casError(): DomainResult {
  return { ok: false, code: 'cas' };
}

function conflictError(): DomainResult {
  return { ok: false, code: 'conflict' };
}

function illegalError(): DomainResult {
  return { ok: false, code: 'illegal' };
}

export function claim(
  item: WorkItem,
  by: string,
  duration: number,
  now: number,
  expectedVersion?: number,
): DomainResult {
  if (item.state === 'doing' && item.assignee === by) {
    return { ok: true, item };
  }

  if (item.state === 'doing') {
    return conflictError();
  }

  if (item.state === 'done') {
    return illegalError();
  }

  if (!casOk(item, expectedVersion)) {
    return casError();
  }

  return {
    ok: true,
    item: {
      ...item,
      state: 'doing',
      assignee: by,
      leaseExpires: now + duration,
      version: item.version + 1,
    },
  };
}

export function expire(
  item: WorkItem,
  now: number,
  expectedVersion?: number,
): DomainResult {
  if (item.state === 'ready') {
    return { ok: true, item };
  }

  if (item.state === 'done') {
    return illegalError();
  }

  if (!casOk(item, expectedVersion)) {
    return casError();
  }

  return {
    ok: true,
    item: {
      ...item,
      state: 'ready',
      assignee: null,
      leaseExpires: null,
      version: item.version + 1,
    },
  };
}

export function close(
  item: WorkItem,
  by: string,
  evidence: string,
  now: number,
  expectedVersion?: number,
): DomainResult {
  if (item.state === 'done') {
    return { ok: true, item };
  }

  if (item.state === 'ready') {
    return illegalError();
  }

  if (item.assignee !== by) {
    return conflictError();
  }

  if (!casOk(item, expectedVersion)) {
    return casError();
  }

  return {
    ok: true,
    item: {
      ...item,
      state: 'done',
      evidence,
      leaseExpires: null,
      version: item.version + 1,
    },
  };
}

export function renewLease(
  item: WorkItem,
  by: string,
  duration: number,
  now: number,
  expectedVersion?: number,
): DomainResult {
  if (item.state !== 'doing' || item.assignee !== by) {
    return illegalError();
  }

  if (!casOk(item, expectedVersion)) {
    return casError();
  }

  return {
    ok: true,
    item: {
      ...item,
      leaseExpires: now + duration,
      version: item.version + 1,
    },
  };
}

export function markReady(
  item: WorkItem,
  now: number,
  expectedVersion?: number,
): DomainResult {
  if (item.state === 'ready' && item.assignee === null && item.leaseExpires === null) {
    return { ok: true, item };
  }

  if (!casOk(item, expectedVersion)) {
    return casError();
  }

  return {
    ok: true,
    item: {
      ...item,
      state: 'ready',
      assignee: null,
      leaseExpires: null,
      version: item.version + 1,
    },
  };
}
