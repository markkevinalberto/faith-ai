/**
 * Transactions on ONE database connection.
 *
 * expo-sqlite's `withExclusiveTransactionAsync` opens a second native connection for each
 * transaction. With SQLCipher that connection never receives `PRAGMA key`, so the very first
 * migration on a phone fails with "file is not a database". Using `BEGIN IMMEDIATE` / `COMMIT` on
 * the keyed connection avoids that, and matches the node:sqlite helper used by the integration tests.
 *
 * Rules:
 * - Transactions run one after another (queued), never interleaved.
 * - Writes issued outside a transaction wait for any open transaction to finish, so they can never
 *   be swept into another transaction's COMMIT or ROLLBACK.
 * - Reads outside a transaction run immediately.
 * - Nesting `transaction()` inside a transaction callback is not supported (it would wait on itself).
 */
import type { SqlDatabase, SqlExecutor } from './sql';

export function createSingleConnectionDatabase(direct: SqlExecutor, close: () => Promise<void>): SqlDatabase {
  // The tail of the transaction queue. Always settled-safe: callers wait on `.catch(() => undefined)`.
  let tail: Promise<unknown> = Promise.resolve();
  const settled = () => tail.catch(() => undefined);

  const guarded: SqlExecutor = {
    execAsync: async (sql) => {
      await settled();
      return direct.execAsync(sql);
    },
    runAsync: async (sql, params) => {
      await settled();
      return direct.runAsync(sql, params);
    },
    getFirstAsync: (sql, params) => direct.getFirstAsync(sql, params),
    getAllAsync: (sql, params) => direct.getAllAsync(sql, params),
  };

  return {
    ...guarded,
    transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const run = settled().then(async () => {
        await direct.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await fn(direct);
          await direct.execAsync('COMMIT');
          return result;
        } catch (e) {
          await direct.execAsync('ROLLBACK').catch(() => undefined);
          throw e;
        }
      });
      tail = run;
      return run;
    },
    close,
  };
}
