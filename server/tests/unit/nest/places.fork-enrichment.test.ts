/**
 * Fork-only: what this fork adds to upstream's list-import enrichment (#886) — the
 * natural-feature matching, the fallback searches, the stored Google customer id and
 * the manual enrich pass over a trip's unlinked places (POST /places/enrich).
 *
 * Kept out of places.service.test.ts / places.enrichment.test.ts so upstream's
 * suites merge without conflicts. Same harness: a real in-memory SQLite DB, the
 * service constructed directly, the maps provider stubbed per case.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PlacePhotoCacheService } from '../../../src/nest/place-photos/place-photo-cache.service';
import { UnsplashService } from '../../../src/nest/unsplash/unsplash.service';
import { RuntimeEnvService } from '../../../src/nest/app-config/runtime-env.service';

// An in-memory DB in place of the shared connection, read back below as `testDb`.
vi.mock('../../../src/db/database', async () => {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: (placeId: number) => db.prepare('SELECT * FROM places WHERE id = ?').get(placeId) ?? null,
    canAccessTrip: () => true,
    isOwner: () => true,
  };
});
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

import { db as testDb } from '../../../src/db/database';
import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { accommodationsOver } from '../../helpers/accommodations-service';
import { createUser, createTrip, createPlace } from '../../helpers/factories';
import { makeStorageFixture } from '../../helpers/storage-fixture';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { PermissionsService } from '../../../src/nest/permissions/permissions.service';
import { RealtimeService } from '../../../src/nest/realtime/realtime.service';
import { PlacesService } from '../../../src/nest/places/places.service';
import { PlacesController } from '../../../src/nest/places/places.controller';
import type { MapsService } from '../../../src/nest/maps/maps.service';
import { QueryHelpersService } from '../../../src/nest/query-helpers/query-helpers.service';
import { JourneyDomainService } from '../../../src/nest/journey/journey-domain.service';
import { TrekPhotosRepository } from '../../../src/nest/photos/trek-photos.repository';
import type { StorageService } from '../../../src/nest/storage/storage.service';
import type { User } from '../../../src/types';
import { EXACT_NAME_MAX_METERS, isNaturalFeature, pickEnrichmentMatch } from '../../../src/nest/places/places.helpers';
import { googleCidFromMapsUrl } from '../../../src/nest/maps/google-cid';

const dbs = new DatabaseService(testDb);
const photoCacheStub = { removeIfUnreferenced: vi.fn() } as unknown as PlacePhotoCacheService;
const storageFx = makeStorageFixture('');

function placesWith(maps: Partial<MapsService>): PlacesService {
  return new PlacesService(
    dbs,
    new PermissionsService(dbs),
    new RealtimeService(),
    maps as MapsService,
    new QueryHelpersService(dbs),
    new UnsplashService(dbs, new RuntimeEnvService(), storageFx.storage),
    photoCacheStub,
    new JourneyDomainService(dbs, new RealtimeService(), new TrekPhotosRepository(dbs)),
    storageFx.storage,
    accommodationsOver(dbs),
  );
}

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});
beforeEach(() => resetTestDb(testDb));
afterAll(() => testDb.close());

// The imported point every case is measured from.
const target = { lat: 48.85, lng: 2.35 };
const AT_44_M = { lat: 48.8504, lng: 2.35 };
const AT_3_KM = { lat: 48.87, lng: 2.38 };
const AT_6_KM = { lat: 48.9, lng: 2.4 };
const OTHER_CONTINENT = { lat: 37.745, lng: -119.55 };

describe('isNaturalFeature', () => {
  it('FORK-ENRICH-001: names a feature by whole word, singular or plural, in any case', () => {
    for (const name of ['Moraine Lake', 'ATHABASCA FALLS', 'Plain of Six Glaciers Trail', 'Plitvice Lakes', 'Blue Mountains', 'Cliffs of Moher', 'Stelvio Pass']) {
      expect(isNaturalFeature(name), name).toBe(true);
    }
  });

  it('FORK-ENRICH-002: leaves venues alone, including ones a keyword only hides in', () => {
    for (const name of ['Cafe Central', '', 'Cambridge Hotel', 'Lakeside Inn', 'Compass Café', 'Riverside Diner', 'Trailhead Brewing']) {
      expect(isNaturalFeature(name), name).toBe(false);
    }
  });
});

describe('pickEnrichmentMatch with an exact name', () => {
  const lake = (id: string, at: { lat: number; lng: number }, name = 'Moraine Lake') => ({ google_place_id: id, name, ...at });

  it('FORK-ENRICH-003: an exact (case-insensitive) name is trusted beyond the radius', () => {
    expect(pickEnrichmentMatch([lake('lake', AT_6_KM)], target)).toBeNull();
    expect(pickEnrichmentMatch([lake('lake', AT_6_KM)], target, undefined, 'moraine lake')?.google_place_id).toBe('lake');
  });

  it('FORK-ENRICH-004: the exact name wins over a nearer place with another name', () => {
    const lodge = lake('lodge', AT_44_M, 'Moraine Lake Lodge');
    expect(pickEnrichmentMatch([lodge, lake('lake', AT_3_KM)], target, 2000, 'Moraine Lake')?.google_place_id).toBe('lake');
  });

  it('FORK-ENRICH-005: of several exact-name hits the closest wins', () => {
    expect(pickEnrichmentMatch([lake('far', AT_6_KM), lake('near', AT_3_KM)], target, undefined, 'Moraine Lake')?.google_place_id).toBe('near');
  });

  it('FORK-ENRICH-006: a namesake further than EXACT_NAME_MAX_METERS is never the place', () => {
    expect(EXACT_NAME_MAX_METERS).toBeLessThan(1_000_000);
    expect(pickEnrichmentMatch([lake('yosemite', OTHER_CONTINENT, 'Mirror Lake')], target, 2000, 'Mirror Lake')).toBeNull();
  });

  it('FORK-ENRICH-007: a name that is not exact still has to be within the radius', () => {
    expect(pickEnrichmentMatch([lake('x', AT_6_KM, 'Moraine Lake Lodge')], target, undefined, 'Moraine Lake')).toBeNull();
  });

  it('FORK-ENRICH-008: an exact name still needs a google_place_id and coordinates', () => {
    const candidates = [
      { google_place_id: null, name: 'Moraine Lake', ...AT_3_KM },
      { google_place_id: 'g', name: 'Moraine Lake', lat: 'x', lng: 'y' },
    ];
    expect(pickEnrichmentMatch(candidates as never, target, undefined, 'Moraine Lake')).toBeNull();
  });
});

describe('googleCidFromMapsUrl', () => {
  it('FORK-ENRICH-009: reads the decimal customer id the Places API puts in googleMapsUri', () => {
    expect(googleCidFromMapsUrl('https://maps.google.com/?cid=10403719659250533155')).toBe('10403719659250533155');
    expect(googleCidFromMapsUrl('https://maps.google.com/?cid=123&g_mp=Cidnb29nbGUu')).toBe('123');
  });

  it('FORK-ENRICH-010: anything else is no id at all', () => {
    for (const url of [null, undefined, '', 'not a url', 'https://maps.google.com/?q=1,2', 'https://maps.google.com/?cid=0x12ab', 'https://maps.google.com/?cid=123456789012345678901']) {
      expect(googleCidFromMapsUrl(url), String(url)).toBeNull();
    }
  });
});

describe('enrichment fallback chain', () => {
  function seed(name: string) {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const place = createPlace(testDb, trip.id, { name, ...target });
    return { user, trip, place };
  }
  const row = (id: number) =>
    testDb.prepare('SELECT google_place_id, google_cid, address FROM places WHERE id = ?').get(id) as {
      google_place_id: string | null; google_cid: string | null; address: string | null;
    };
  const noPhoto = vi.fn(async () => ({ photoUrl: null, attribution: null }));

  it('FORK-ENRICH-011: a natural feature is found by its exact name on the unbiased search, and keeps the customer id', async () => {
    const { user, trip, place } = seed('Moraine Lake');
    const searchPlaces = vi.fn()
      .mockResolvedValueOnce({ source: 'google', places: [] })
      .mockResolvedValueOnce({ source: 'google', places: [{ google_place_id: 'lake', google_cid: '777', name: 'Moraine Lake', ...AT_6_KM }] });
    await placesWith({ getMapsKey: () => 'key', searchPlaces, getPlacePhoto: noPhoto } as never)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Moraine Lake', ...target }]);
    expect(searchPlaces.mock.calls[1][3]).toBeUndefined(); // the wide search carries no location bias
    expect(row(place.id)).toMatchObject({ google_place_id: 'lake', google_cid: '777' });
  });

  it('FORK-ENRICH-012: an ordinary venue is never taken for a namesake kilometres away', async () => {
    const { user, trip, place } = seed('Starbucks');
    const namesake = { google_place_id: 'elsewhere', name: 'Starbucks', ...AT_6_KM };
    const searchPlaces = vi.fn().mockResolvedValue({ source: 'google', places: [namesake] });
    const reverseGeocode = vi.fn(async () => ({ name: null, address: null }));
    await placesWith({ getMapsKey: () => 'key', searchPlaces, reverseGeocode } as never)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Starbucks', ...target }]);
    expect(row(place.id).google_place_id).toBeNull();
  });

  it('FORK-ENRICH-013: the address search resolves a place its name finds nothing near', async () => {
    const { user, trip, place } = seed('Chez Paul');
    const searchPlaces = vi.fn()
      .mockResolvedValueOnce({ source: 'google', places: [] })
      .mockResolvedValueOnce({ source: 'google', places: [] })
      .mockResolvedValueOnce({ source: 'google', places: [{ google_place_id: 'by-address', name: 'Chez Paul (bistro)', ...AT_44_M }] });
    await placesWith({ getMapsKey: () => 'key', searchPlaces, getPlacePhoto: noPhoto } as never)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Chez Paul', address: '13 Rue de Charonne', ...target }]);
    expect(searchPlaces.mock.calls[2][1]).toBe('13 Rue de Charonne');
    expect(row(place.id).google_place_id).toBe('by-address');
  });

  it('FORK-ENRICH-014: last, the name OpenStreetMap gives the point is searched near it', async () => {
    const { user, trip, place } = seed('Pin 12');
    const searchPlaces = vi.fn()
      .mockResolvedValueOnce({ source: 'google', places: [] })
      .mockResolvedValueOnce({ source: 'google', places: [] })
      .mockResolvedValueOnce({ source: 'google', places: [{ google_place_id: 'by-osm-name', ...AT_44_M }] });
    const reverseGeocode = vi.fn(async () => ({ name: 'Musée Picasso', address: null }));
    await placesWith({ getMapsKey: () => 'key', searchPlaces, reverseGeocode, getPlacePhoto: noPhoto } as never)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Pin 12', ...target }]);
    expect(reverseGeocode).toHaveBeenCalledWith(String(target.lat), String(target.lng), undefined, expect.objectContaining({ lane: 'background' }));
    expect(searchPlaces.mock.calls[2][1]).toBe('Musée Picasso');
    expect(row(place.id).google_place_id).toBe('by-osm-name');
  });

  it('FORK-ENRICH-015: a customer id already stored is never overwritten', async () => {
    const { user, trip, place } = seed('Bar');
    testDb.prepare('UPDATE places SET google_cid = ? WHERE id = ?').run('111', place.id);
    const searchPlaces = vi.fn().mockResolvedValue({ source: 'google', places: [{ google_place_id: 'g', google_cid: '222', ...AT_44_M }] });
    await placesWith({ getMapsKey: () => 'key', searchPlaces, getPlacePhoto: noPhoto } as never)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Bar', ...target }]);
    expect(row(place.id)).toMatchObject({ google_place_id: 'g', google_cid: '111' });
  });
});

describe('manual enrich pass', () => {
  it('FORK-ENRICH-016: picks the trip\'s unlinked places, never its tracks, coordinate-less pins or other trips\' places', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const unlinked = createPlace(testDb, trip.id, { name: 'Unlinked' });
    const blankId = createPlace(testDb, trip.id, { name: 'Blank id' });
    const linked = createPlace(testDb, trip.id, { name: 'Linked' });
    const track = createPlace(testDb, trip.id, { name: 'Morning hike' });
    const coordless = createPlace(testDb, trip.id, { name: 'Somewhere' });
    createPlace(testDb, other.id, { name: 'Other trip' });
    testDb.prepare("UPDATE places SET google_place_id = '' WHERE id = ?").run(blankId.id);
    testDb.prepare("UPDATE places SET google_place_id = 'ChIJ' WHERE id = ?").run(linked.id);
    testDb.prepare("UPDATE places SET route_geometry = '[[48.85,2.35],[48.86,2.36]]' WHERE id = ?").run(track.id);
    testDb.prepare('UPDATE places SET lat = NULL, lng = NULL WHERE id = ?').run(coordless.id);

    const ids = placesWith({}).listUnenrichedPlaces(String(trip.id)).map(p => p.id).sort((a, b) => a - b);
    expect(ids).toEqual([unlinked.id, blankId.id].sort((a, b) => a - b));
  });

  it('FORK-ENRICH-017: without a Google key nothing is queued and nothing is searched', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    createPlace(testDb, trip.id, { name: 'Unlinked' });
    const searchPlaces = vi.fn();
    expect(placesWith({ getMapsKey: () => null, searchPlaces } as never).enrichUnlinkedPlaces(String(trip.id), user.id)).toBeNull();
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('FORK-ENRICH-018: with a key it reports how many it queued and resolves them in the background', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const place = createPlace(testDb, trip.id, { name: 'Bar', ...target });
    const searchPlaces = vi.fn().mockResolvedValue({ source: 'google', places: [{ google_place_id: 'resolved', ...AT_44_M }] });
    const svc = placesWith({ getMapsKey: () => 'key', searchPlaces, getPlacePhoto: vi.fn(async () => ({ photoUrl: null })) } as never);
    expect(svc.enrichUnlinkedPlaces(String(trip.id), user.id)).toBe(1);
    await vi.waitFor(() => {
      const got = testDb.prepare('SELECT google_place_id FROM places WHERE id = ?').get(place.id) as { google_place_id: string | null };
      expect(got.google_place_id).toBe('resolved');
    });
  });
});

describe('POST /api/trips/:tripId/places/enrich', () => {
  const user = { id: 1, role: 'user' } as User;
  const storage = {} as StorageService;
  function controller(o: Partial<Record<'verifyTripAccess' | 'canEdit' | 'enrichUnlinkedPlaces', unknown>>) {
    const places = {
      verifyTripAccess: vi.fn().mockReturnValue({ user_id: 1 }),
      canEdit: vi.fn().mockReturnValue(true),
      enrichUnlinkedPlaces: vi.fn().mockReturnValue(3),
      ...o,
    } as unknown as PlacesService;
    return new PlacesController(places, new RuntimeEnvService(), storage);
  }
  function thrown(fn: () => unknown) {
    try { fn(); } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      return { status: (err as HttpException).getStatus(), body: (err as HttpException).getResponse() };
    }
    throw new Error('expected throw');
  }

  it('FORK-ENRICH-019: 404 for a trip the caller cannot see, 403 without edit rights', () => {
    expect(thrown(() => controller({ verifyTripAccess: vi.fn().mockReturnValue(null) }).enrich(user, '5'))).toEqual({ status: 404, body: { error: 'Trip not found' } });
    const enrichUnlinkedPlaces = vi.fn();
    expect(thrown(() => controller({ canEdit: vi.fn().mockReturnValue(false), enrichUnlinkedPlaces }).enrich(user, '5'))).toEqual({ status: 403, body: { error: 'No permission' } });
    expect(enrichUnlinkedPlaces).not.toHaveBeenCalled();
  });

  it('FORK-ENRICH-020: 400 rather than a count of places nothing will happen to when no key is set', () => {
    expect(thrown(() => controller({ enrichUnlinkedPlaces: vi.fn().mockReturnValue(null) }).enrich(user, '5'))).toEqual({
      status: 400, body: { error: 'A Google Maps API key is required to enrich places' },
    });
  });

  it('FORK-ENRICH-021: answers with how many places were queued', () => {
    const enrichUnlinkedPlaces = vi.fn().mockReturnValue(3);
    expect(controller({ enrichUnlinkedPlaces }).enrich(user, '5')).toEqual({ enriched: 3, message: '3 places queued for enrichment' });
    expect(enrichUnlinkedPlaces).toHaveBeenCalledWith('5', 1);
  });
});
