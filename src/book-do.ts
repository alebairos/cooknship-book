import { applyPending, MIGRATION_FILES } from './migrations.js';

export class BookDO extends DurableObject {
  constructor(state: DurableObjectState, env: unknown) {
    super(state, env);
    const sqlExec = (sql: string, params?: unknown[]) => {
      const result = state.storage.sql.exec(sql, ...(params ?? []));
      return result.toArray();
    };
    applyPending(sqlExec, MIGRATION_FILES);
  }

  async alarm(): Promise<void> {}
}
