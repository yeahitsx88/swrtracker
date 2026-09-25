/** Thirty-minute scan for pending Party Chief approvals. */
import { getPool } from '@/lib/db';
import { setTimeout as delay } from 'node:timers/promises';
import { emitStuckPcSignals } from './application/timeout-signals';

async function scan(): Promise<number> {
  const pool = getPool();
  let emitted = 0;
  let count: number;
  do {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      count = await emitStuckPcSignals(client, 100);
      await client.query('COMMIT');
      emitted += count;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } while (count === 100);
  return emitted;
}

async function main(): Promise<void> {
  const pool = getPool();
  let stopping = false;
  const stop = new AbortController();
  process.once('SIGINT', () => { stopping = true; stop.abort(); });
  process.once('SIGTERM', () => { stopping = true; stop.abort(); });
  try {
    while (!stopping) {
      const emitted = await scan();
      if (emitted) process.stdout.write(`stuck approvals: ${emitted}\n`);
      if (!stopping) {
        try { await delay(30 * 60 * 1000, undefined, { signal: stop.signal }); }
        catch (error) { if (!stop.signal.aborted) throw error; }
      }
    }
  } finally {
    await pool.end();
  }
}

void main().catch(error => {
  process.stderr.write(`timeout signal worker stopped: ${
    error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
