import { openDatabaseSync } from 'expo-sqlite';
import type { SqlDriver, SqlParam } from './driver';

export function openExpoDriver(name = 'pocketledger.db'): SqlDriver {
  const db = openDatabaseSync(name);
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');
  let depth = 0;

  return {
    exec(sql: string): void {
      db.execSync(sql);
    },
    run(sql: string, params: SqlParam[] = []) {
      return { changes: db.runSync(sql, params).changes };
    },
    all<T>(sql: string, params: SqlParam[] = []): T[] {
      return db.getAllSync<T>(sql, params);
    },
    first<T>(sql: string, params: SqlParam[] = []): T | null {
      return db.getFirstSync<T>(sql, params) ?? null;
    },
    transaction<T>(fn: () => T): T {
      // Nested calls join the outer transaction (SQLite has no true nesting).
      if (depth > 0) return fn();
      let result: T | undefined;
      let completed = false;
      depth++;
      try {
        db.withTransactionSync(() => {
          result = fn();
          completed = true;
        });
      } finally {
        depth--;
      }
      if (!completed) throw new Error('Database transaction did not complete.');
      return result as T;
    },
  };
}