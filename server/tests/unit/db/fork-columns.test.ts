/**
 * Fork-only: columns this fork adds on top of upstream, created by the idempotent
 * `ensureForkColumns` step at the end of runMigrations rather than by a numbered
 * migration (a fork-only entry in that positional array would collide with the
 * next upstream migration).
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';

function freshDb() {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  createTables(db);
  return db;
}

const hasColumn = (db: Database.Database, table: string, column: string) =>
  !!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);

describe('fork columns', () => {
  it('FORKCOL-001: places.google_cid exists after migrations on a fresh database', () => {
    const db = freshDb();
    runMigrations(db);
    expect(hasColumn(db, 'places', 'google_cid')).toBe(true);
  });

  it('FORKCOL-002: running the migrations again is a no-op, not an error', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(hasColumn(db, 'places', 'google_cid')).toBe(true);
  });

  it('FORKCOL-003: an existing database that is already fully migrated still gets the column', () => {
    const db = freshDb();
    runMigrations(db);
    // Simulate a database from before the fork column existed: same schema version,
    // column absent. The step must not depend on the numbered migrations running.
    db.exec('ALTER TABLE places DROP COLUMN google_cid');
    expect(hasColumn(db, 'places', 'google_cid')).toBe(false);
    runMigrations(db);
    expect(hasColumn(db, 'places', 'google_cid')).toBe(true);
  });

  it('FORKCOL-004: a stored google_cid round-trips', () => {
    const db = freshDb();
    runMigrations(db);
    db.prepare("INSERT INTO users (id, username, email, password_hash, role) VALUES (1, 'u', 'u@test.local', 'x', 'user')").run();
    db.prepare("INSERT INTO trips (id, user_id, title) VALUES (1, 1, 'T')").run();
    db.prepare("INSERT INTO places (id, trip_id, name, google_cid) VALUES (1, 1, 'Place', '12345')").run();
    const row = db.prepare('SELECT google_cid FROM places WHERE id = 1').get() as { google_cid: string | null };
    expect(row.google_cid).toBe('12345');
  });
});
