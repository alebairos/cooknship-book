export type BackfillRow = {
  ts: number;
  host: string;
  by: string | null;
  kind: string;
  station: string | null;
  payload: string;
};

function splitTsv(text: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (inQuotes) {
        inQuotes = false;
      } else {
        inQuotes = true;
      }
      continue;
    }

    if (inQuotes) {
      current += char;
      continue;
    }

    if (char === '\t') {
      fields.push(current);
      current = '';
      continue;
    }

    if (char === '\r') {
      if (text[i + 1] === '\n') i++;
      fields.push(current);
      rows.push(fields);
      fields = [];
      current = '';
      continue;
    }

    if (char === '\n') {
      fields.push(current);
      rows.push(fields);
      fields = [];
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  if (fields.length > 1 || fields[0] !== '') {
    rows.push(fields);
  }

  return rows;
}

function parseMetricsJson(value: string): unknown {
  if (value === '') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseCookEventsTsv(text: string): BackfillRow[] {
  const rows = splitTsv(text);
  if (rows.length === 0) return [];

  const header = rows[0];
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = row[index] ?? '';
    });

    const ts = new Date(record.ts).getTime();
    if (Number.isNaN(ts)) {
      throw new Error(`Invalid ts: ${record.ts}`);
    }

    const payload = {
      wiId: record.wi,
      artifact: record.artifact,
      result: record.result,
      inbox: record.inbox,
      metrics_json: parseMetricsJson(record.metrics_json),
      source: record.source,
    };

    return {
      ts,
      host: record.intent,
      by: record.actor || null,
      kind: record.kind,
      station: record.station || null,
      payload: JSON.stringify(payload),
    };
  });
}
