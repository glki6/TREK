import { addColumnIfMissing } from '../migration-utils';
import { Migration } from '@mikro-orm/migrations';

/**
 * Fork-only: a place keeps its Google Maps customer id (CID), read off the Places
 * API's `googleMapsUri` by the list-import enrichment. The Google Maps link opens a
 * place by it, which the iOS app resolves to the place itself.
 *
 * Numbered between upstream's steps (they count in tens) so it never takes a name
 * upstream ships. A database this fork ran on 4.3.x already has the column, added on
 * every boot by the retired `ensureForkColumns`, so the add only runs where it is missing.
 */
export class Migration20200101046301_fork_a_place_keeps_its_google_customer_id extends Migration {
  override name = 'Migration20200101046301_fork_a_place_keeps_its_google_customer_id';

  override async up(): Promise<void> {
    await addColumnIfMissing(this, 'places', 'google_cid', `google_cid TEXT`);
  }
}
