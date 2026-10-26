/**
 * Fork-only: `Migration20200101046301_fork_a_place_keeps_its_google_customer_id` gives
 * `places` its `google_cid` column, and leaves a database this fork ran on 4.3.x, which
 * already has the column, as it is. FORKCIDMIG-001 to 003.
 */
import { Migration20200101046301_fork_a_place_keeps_its_google_customer_id as ForkGoogleCid } from '../../../src/db/migrations/Migration20200101046301_fork_a_place_keeps_its_google_customer_id';
import {
  createMigrationOrm,
  migrateTo,
  pendingNames,
  rawExec,
  rawQuery,
  runMigrationDirect,
} from '../../helpers/migration-step';
import type { MikroORM } from '@mikro-orm/sqlite';

import { describe, expect, it } from 'vitest';

const TARGET = 'Migration20200101046301_fork_a_place_keeps_its_google_customer_id';

async function ormBeforeTarget(): Promise<MikroORM> {
  const orm = await createMigrationOrm();
  const names = await pendingNames(orm);
  const index = names.indexOf(TARGET);
  expect(index).toBeGreaterThan(0);
  await migrateTo(orm, names[index - 1]);
  return orm;
}

const cidColumns = (orm: MikroORM) =>
  rawQuery<{ name: string; type: string }>(
    orm,
    "SELECT name, type FROM pragma_table_info('places') WHERE name = 'google_cid'",
  );

describe('fork google_cid migration', () => {
  it('FORKCIDMIG-001: runs after every upstream step and adds a nullable TEXT column', async () => {
    const orm = await ormBeforeTarget();
    try {
      expect(await cidColumns(orm)).toEqual([]);
      await migrateTo(orm, TARGET);
      expect(await cidColumns(orm)).toEqual([{ name: 'google_cid', type: 'TEXT' }]);
      await rawExec(orm, "INSERT INTO users (username, email, password_hash) VALUES ('u', 'u@example.test', 'x')");
      await rawExec(orm, "INSERT INTO trips (user_id, title) VALUES (1, 'T')");
      await rawExec(orm, "INSERT INTO places (trip_id, name, google_cid) VALUES (1, 'P', '10403719659250533155')");
      expect(await rawQuery(orm, 'SELECT google_cid FROM places')).toEqual([{ google_cid: '10403719659250533155' }]);
    } finally {
      await orm.close();
    }
  });

  it('FORKCIDMIG-002: a database whose column the 4.3.x fork already added keeps it, and its values', async () => {
    const orm = await ormBeforeTarget();
    try {
      await rawExec(orm, 'ALTER TABLE places ADD COLUMN google_cid TEXT');
      await rawExec(orm, "INSERT INTO users (username, email, password_hash) VALUES ('u', 'u@example.test', 'x')");
      await rawExec(orm, "INSERT INTO trips (user_id, title) VALUES (1, 'T')");
      await rawExec(orm, "INSERT INTO places (trip_id, name, google_cid) VALUES (1, 'P', '42')");
      await migrateTo(orm, TARGET);
      expect(await cidColumns(orm)).toHaveLength(1);
      expect(await rawQuery(orm, 'SELECT google_cid FROM places')).toEqual([{ google_cid: '42' }]);
    } finally {
      await orm.close();
    }
  });

  it('FORKCIDMIG-003: running it again is a no-op, not an error', async () => {
    const orm = await ormBeforeTarget();
    try {
      await migrateTo(orm, TARGET);
      await runMigrationDirect(orm, ForkGoogleCid);
      expect(await cidColumns(orm)).toHaveLength(1);
    } finally {
      await orm.close();
    }
  });
});
