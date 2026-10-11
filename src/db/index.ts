import type { SqlDriver } from './driver';
import { openExpoDriver } from './expoDriver';
import { migrate } from './schema';

let instance: SqlDriver | null = null;

/** Opens pocketledger.db once (on first use) and applies pending migrations. Works fully offline. */
export function getDb(): SqlDriver {
  if (!instance) {
    const db = openExpoDriver();
    migrate(db);
    instance = db;
  }
  return instance;
}