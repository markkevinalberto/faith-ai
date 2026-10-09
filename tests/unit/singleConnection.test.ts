import { createSingleConnectionDatabase } from '@/db/singleConnection';
import type { SqlExecutor } from '@/db/sql';

/** Records every statement in the order the (serial) native queue would receive it. */
function fakeExecutor() {
  const log: string[] = [];
  const exec: SqlExecutor = {
    execAsync: async (sql) => {
      log.push(sql);
    },
    runAsync: async (sql) => {
      log.push(sql);
      return { changes: 1, lastInsertRowId: 1 };
    },
    getFirstAsync: async (sql) => {
      log.push(sql);
      return null;
    },
    getAllAsync: async (sql) => {
      log.push(sql);
      return [];
    },
  };
  return { exec, log };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('single-connection transactions (SQLCipher-safe)', () => {
  it('runs BEGIN IMMEDIATE / COMMIT on the same connection and returns the result', async () => {
    const { exec, log } = fakeExecutor();
    const db = createSingleConnectionDatabase(exec, async () => undefined);
    const out = await db.transaction(async (tx) => {
      await tx.runAsync('INSERT 1');
      return 42;
    });
    expect(out).toBe(42);
    expect(log).toEqual(['BEGIN IMMEDIATE', 'INSERT 1', 'COMMIT']);
  });

  it('rolls back and rethrows when the callback fails', async () => {
    const { exec, log } = fakeExecutor();
    const db = createSingleConnectionDatabase(exec, async () => undefined);
    await expect(
      db.transaction(async (tx) => {
        await tx.runAsync('INSERT 1');
        throw new Error('validation failed');
      }),
    ).rejects.toThrow('validation failed');
    expect(log).toEqual(['BEGIN IMMEDIATE', 'INSERT 1', 'ROLLBACK']);
  });

  it('queues concurrent transactions instead of interleaving them, even after a failure', async () => {
    const { exec, log } = fakeExecutor();
    const db = createSingleConnectionDatabase(exec, async () => undefined);
    const a = db.transaction(async (tx) => {
      await tx.runAsync('A1');
      await tick();
      throw new Error('A failed');
    });
    const b = db.transaction(async (tx) => {
      await tx.runAsync('B1');
      await tick();
      await tx.runAsync('B2');
    });
    await expect(a).rejects.toThrow('A failed');
    await b;
    expect(log).toEqual(['BEGIN IMMEDIATE', 'A1', 'ROLLBACK', 'BEGIN IMMEDIATE', 'B1', 'B2', 'COMMIT']);
  });

  it('makes outside writes wait for an open transaction, while reads run immediately', async () => {
    const { exec, log } = fakeExecutor();
    const db = createSingleConnectionDatabase(exec, async () => undefined);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tx = db.transaction(async (t) => {
      await t.runAsync('T1');
      await gate;
    });
    await tick();
    const write = db.runAsync('OUTSIDE WRITE');
    const read = db.getAllAsync('OUTSIDE READ');
    await tick();
    expect(log).toEqual(['BEGIN IMMEDIATE', 'T1', 'OUTSIDE READ']);
    release();
    await Promise.all([tx, write, read]);
    expect(log).toEqual(['BEGIN IMMEDIATE', 'T1', 'OUTSIDE READ', 'COMMIT', 'OUTSIDE WRITE']);
  });
});
