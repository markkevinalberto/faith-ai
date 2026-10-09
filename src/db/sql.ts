/**
 * Minimal database interface shared by the app (expo-sqlite + SQLCipher) and integration tests
 * (Node's built-in node:sqlite). Repositories depend only on this, so the same SQL is exercised
 * in tests and on device. All values are bound as parameters — never interpolated.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Runs `fn` in an exclusive transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const toBit = (b: boolean): number => (b ? 1 : 0);
export const fromBit = (n: number | null | undefined): boolean => n === 1;

/** Builds "(?, ?, ?)" for IN clauses with a non-empty list. */
export function placeholders(count: number): string {
  if (count < 1) throw new Error('placeholders() requires at least one value');
  return `(${new Array(count).fill('?').join(', ')})`;
}

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = 'NotFoundError';
  }
}
