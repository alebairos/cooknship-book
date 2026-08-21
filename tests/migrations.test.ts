import { describe, expect, it } from 'vitest';
import { applyPending, MIGRATION_FILES } from '../src/migrations.js';

class FakeExec {
  migrations: string[] = [];
  tables = new Set<string>();

  exec(sql: string, params?: unknown[]): Array<Record<string, unknown>> {
    const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\S+)/i);
    if (createMatch) this.tables.add(createMatch[1]);

    if (sql.includes('SELECT version FROM _sql_schema_migrations')) {
      return this.migrations.map((version) => ({ version }));
    }

    if (sql.match(/INSERT INTO _sql_schema_migrations/i)) {
      this.migrations.push(params?.[0] as string);
      return [];
    }

    return [];
  }
}

describe('applyPending', () => {
  it('creates the migrations table and returns empty when no files exist', () => {
    const fake = new FakeExec();
    const applied = applyPending(fake.exec.bind(fake), []);
    expect(applied).toEqual([]);
    expect(fake.tables.has('_sql_schema_migrations')).toBe(true);
  });

  it('applies pending migrations in order and records versions', () => {
    const fake = new FakeExec();
    const applied = applyPending(fake.exec.bind(fake), [
      { version: '001', sql: 'CREATE TABLE a (id TEXT);' },
      { version: '002', sql: 'CREATE TABLE b (id TEXT);' },
    ]);
    expect(applied).toEqual(['001', '002']);
    expect(fake.migrations).toEqual(['001', '002']);
  });

  it('skips already applied migrations', () => {
    const fake = new FakeExec();
    fake.migrations = ['001'];
    const applied = applyPending(fake.exec.bind(fake), [
      { version: '001', sql: 'CREATE TABLE a (id TEXT);' },
      { version: '002', sql: 'CREATE TABLE b (id TEXT);' },
    ]);
    expect(applied).toEqual(['002']);
    expect(fake.migrations).toEqual(['001', '002']);
  });

  it('MIGRATION_FILES matches the 001_init.sql file on disk', () => {
    expect(MIGRATION_FILES.length).toBeGreaterThan(0);
    expect(MIGRATION_FILES[0].version).toBe('001');
  });
});
