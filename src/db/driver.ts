export type SqlParam = string | number | null;

export interface RunResult {
  changes: number;
}

/** Minimal synchronous SQL interface. expo-sqlite implements it on iPhone; sql.js implements it in tests. */
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: SqlParam[]): RunResult;
  all<T>(sql: string, params?: SqlParam[]): T[];
  first<T>(sql: string, params?: SqlParam[]): T | null;
  transaction<T>(fn: () => T): T;
}