import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

const sql = readFileSync('db/migrations/023_requested_execution_timestamp.sql', 'utf8');

test('requested execution migration preserves calendar dates and exact instants on rerun',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    try {
      // Isolate the migration's table from the application schema and its data.
      const schema = `date_test_${randomUUID().replaceAll('-', '')}`;
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`SET LOCAL search_path TO "${schema}"`);
      await db.query("SET LOCAL TIME ZONE 'America/Chicago'");
      await db.query('CREATE TABLE tickets(id integer PRIMARY KEY, requested_date date)');
      await db.query("INSERT INTO tickets VALUES(1,'2026-10-02'),(2,NULL)");
      await db.query(sql);
      const migrated = await db.query<{ requested_date: Date | null }>('SELECT requested_date FROM tickets ORDER BY id');
      assert.equal(migrated.rows[0]?.requested_date?.toISOString(), '2026-10-02T00:00:00.000Z');
      assert.equal(migrated.rows[1]?.requested_date, null);
      await db.query("UPDATE tickets SET requested_date='2026-10-02T09:35:00-05:00' WHERE id=1");
      await db.query(sql);
      const rerun = await db.query<{ requested_date: Date }>('SELECT requested_date FROM tickets WHERE id=1');
      assert.equal(rerun.rows[0]?.requested_date.toISOString(), '2026-10-02T14:35:00.000Z');
    } finally { await db.query('ROLLBACK'); await db.end(); }
  });
