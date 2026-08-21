export type EventRow = {
  seq?: number;
  ts: number;
  host: string;
  by: string | null;
  kind: string;
  station: null;
  payload: string | null;
};

export type EventPayload = {
  wiId: string;
  version: number;
};

export function verbToKind(verb: string): string | null {
  switch (verb) {
    case 'claim':
      return 'claim';
    case 'renew-lease':
      return 'renew';
    case 'close':
      return 'close';
    case 'mark-ready':
      return 'mark-ready';
    case 'expire':
      return 'expire';
    case 'upsert':
      return 'upsert';
    default:
      return null;
  }
}

export function buildEvent({
  host,
  by,
  kind,
  ts,
  wiId,
  version,
}: {
  host: string;
  by: string | null;
  kind: string;
  ts: number;
  wiId: string;
  version: number;
}): EventRow {
  const payload: EventPayload = { wiId, version };
  return {
    ts,
    host,
    by,
    kind,
    station: null,
    payload: JSON.stringify(payload),
  };
}

export function shouldAppend(ok: boolean): boolean {
  return ok;
}

export function filterEventsSince(events: EventRow[], since?: number): EventRow[] {
  const sinceSeq = since === undefined ? -Infinity : since;
  return events.filter((e) => (e.seq === undefined ? true : e.seq > sinceSeq)).sort((a, b) => {
    const seqA = a.seq === undefined ? 0 : a.seq;
    const seqB = b.seq === undefined ? 0 : b.seq;
    return seqA - seqB;
  });
}
