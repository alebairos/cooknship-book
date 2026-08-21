export type SqlExec = (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;

export type MigrationFile = {
  version: string;
  sql: string;
};

export const MIGRATION_FILES: MigrationFile[] = [
  {
    version: '001',
    sql: `CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  assignee TEXT,
  lease_expires INTEGER,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS queues (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wis (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ready', 'doing', 'done')),
  assignee TEXT,
  lease_expires INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  host TEXT NOT NULL,
  by TEXT,
  kind TEXT NOT NULL,
  station TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS actors (
  by TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  email TEXT
);`,
  },
];

export function applyPending(sqlExec: SqlExec, files: MigrationFile[]): string[] {
  sqlExec(`CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const rows = sqlExec('SELECT version FROM _sql_schema_migrations ORDER BY version');
  const applied = new Set(rows.map((row) => row.version as string));

  const appliedVersions: string[] = [];
  for (const file of files) {
    if (applied.has(file.version)) continue;
    const statements = file.sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      sqlExec(statement + ';');
    }
    sqlExec('INSERT INTO _sql_schema_migrations (version, applied_at) VALUES (?, ?)', [
      file.version,
      Date.now(),
    ]);
    appliedVersions.push(file.version);
  }
  return appliedVersions;
}
