CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
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
);
