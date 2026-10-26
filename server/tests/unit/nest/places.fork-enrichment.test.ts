/**
 * Fork-only: how the import enrichment finds an imported point on Google, the customer
 * id it keeps, and the manual enrich pass (src/nest/places/place-enrichment.fork.ts,
 * places-enrich.service.ts, maps/google-cid.ts). FORK-ENRICH-001 to FORK-ENRICH-021.
 * The route itself is covered by tests/e2e/places-enrich.e2e.test.ts.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import type { PlaceRow } from '../../../src/db/repositories/Places.repository';
import { DomainError } from '../../../src/nest/common/domain-error';
import { googleCidFromMapsUrl } from '../../../src/nest/maps/google-cid';
import { MapsService } from '../../../src/nest/maps/maps.service';
import {
  EXACT_NAME_MAX_METERS,
  findEnrichmentMatch,
  isNaturalFeature,
  pickNaturalFeatureMatch,
  unlinkedPlaces,
  type EnrichmentMaps,
} from '../../../src/nest/places/place-enrichment.fork';
import { PlacesEnrichService } from '../../../src/nest/places/places-enrich.service';
import { PlacesModule } from '../../../src/nest/places/places.module';
import { PlacesService } from '../../../src/nest/places/places.service';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { makePlace } from '../../helpers/factories/places';
import { findRow } from '../../helpers/factories/rows';
import { makeTrip } from '../../helpers/factories/trips';
import { makeUser } from '../../helpers/factories/users';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { MikroORM } from '@mikro-orm/core';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const target = { lat: 48.85, lng: 2.35 };
/** A Google search hit; 0.01° of latitude is about 1.1 km. */
const hit = (id: string, name: string, lat: number, lng = 2.35, extra: Record<string, unknown> = {}) => ({
  google_place_id: id,
  name,
  lat,
  lng,
  ...extra,
});

describe('isNaturalFeature', () => {
  it('FORK-ENRICH-001: names a feature by whole word, singular or plural, in any case', () => {
    for (const name of [
      'Moraine Lake',
      'ATHABASCA FALLS',
      'Plain of Six Glaciers Trail',
      'Cliffs of Moher',
      'Brooklyn Bridge',
    ]) {
      expect(isNaturalFeature(name), name).toBe(true);
    }
  });

  it('FORK-ENRICH-002: leaves venues alone, including ones a keyword only hides in', () => {
    for (const name of ['Cambridge', 'Lakeside Inn', 'Compass Café', 'Trailhead Coffee', 'Café Central', '']) {
      expect(isNaturalFeature(name), name).toBe(false);
    }
  });
});

describe('pickNaturalFeatureMatch', () => {
  it('FORK-ENRICH-003: an exact name, in any case, is trusted kilometres beyond the wide radius', () => {
    expect(pickNaturalFeatureMatch([hit('lake', 'Moraine Lake', 48.9)], target, 'moraine lake')?.google_place_id).toBe(
      'lake',
    );
  });

  it('FORK-ENRICH-004: the exact name wins over a nearer place with another name, and the closest namesake wins', () => {
    const candidates = [
      hit('lodge', 'Moraine Lake Lodge', 48.8501),
      hit('far', 'Moraine Lake', 48.95),
      hit('lake', 'Moraine Lake', 48.86),
    ];
    expect(pickNaturalFeatureMatch(candidates, target, 'Moraine Lake')?.google_place_id).toBe('lake');
  });

  it('FORK-ENRICH-005: a namesake further than EXACT_NAME_MAX_METERS is never the place', () => {
    const farAway = 48.85 + (EXACT_NAME_MAX_METERS + 5_000) / 111_000;
    expect(pickNaturalFeatureMatch([hit('elsewhere', 'Mirror Lake', farAway)], target, 'Mirror Lake')).toBeNull();
  });

  it('FORK-ENRICH-006: without a namesake, a hit within the wide radius is taken and nothing beyond it', () => {
    expect(
      pickNaturalFeatureMatch([hit('near', 'Lake shore car park', 48.86)], target, 'Moraine Lake')?.google_place_id,
    ).toBe('near');
    expect(pickNaturalFeatureMatch([hit('away', 'Lake shore car park', 48.9)], target, 'Moraine Lake')).toBeNull();
  });

  it('FORK-ENRICH-007: an exact name still needs a google_place_id and coordinates', () => {
    const candidates = [
      { google_place_id: null, name: 'Moraine Lake', lat: 48.86, lng: 2.35 },
      { google_place_id: 'g', name: 'Moraine Lake', lat: 'x', lng: 'y' },
    ];
    expect(pickNaturalFeatureMatch(candidates, target, 'Moraine Lake')).toBeNull();
  });
});

describe('googleCidFromMapsUrl', () => {
  it('FORK-ENRICH-008: reads the decimal customer id the Places API puts in googleMapsUri', () => {
    expect(googleCidFromMapsUrl('https://maps.google.com/?cid=10403719659250533155')).toBe('10403719659250533155');
  });

  it('FORK-ENRICH-009: anything else is no id at all', () => {
    for (const url of [
      undefined,
      null,
      '',
      'not a url',
      'https://maps.google.com/?cid=12ab',
      'https://maps.google.com/?q=x',
    ]) {
      expect(googleCidFromMapsUrl(url), String(url)).toBeNull();
    }
  });
});

describe('findEnrichmentMatch', () => {
  type Search = EnrichmentMaps['searchPlaces'];
  type Reverse = EnrichmentMaps['reverseGeocode'];
  /** Answers each search from the list in order, then nothing; the reverse lookup answers `reverseName`. */
  function fakeMaps(
    answers: Record<string, unknown>[][],
    reverse: () => Promise<{ name: string | null; address: string | null }>,
  ) {
    const searchPlaces = vi.fn<Search>(async () => ({ places: answers.shift() ?? [], source: 'google' }));
    const reverseGeocode = vi.fn<Reverse>(reverse);
    return { maps: { searchPlaces, reverseGeocode } as EnrichmentMaps, searchPlaces, reverseGeocode };
  }
  const noName = async () => ({ name: null, address: null });

  it('FORK-ENRICH-010: the first search that finds the place ends it: the name, biased to the point', async () => {
    const { maps, searchPlaces, reverseGeocode } = fakeMaps([[hit('bar', 'Bar', 48.8501)]], noName);
    expect((await findEnrichmentMatch(maps, 7, { name: 'Bar', ...target }, 'fr'))?.google_place_id).toBe('bar');
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(searchPlaces).toHaveBeenCalledWith(
      7,
      'Bar',
      'fr',
      { ...target, radius: 2000 },
      { googleIdentityOnly: true },
    );
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it('FORK-ENRICH-011: a natural feature is found by its exact name on the unbiased search', async () => {
    const { maps, searchPlaces } = fakeMaps([[], [hit('lake', 'Moraine Lake', 48.9)]], noName);
    expect((await findEnrichmentMatch(maps, 7, { name: 'Moraine Lake', ...target }))?.google_place_id).toBe('lake');
    expect(searchPlaces.mock.calls[1]).toEqual([7, 'Moraine Lake', undefined, undefined, { googleIdentityOnly: true }]);
  });

  it('FORK-ENRICH-012: an ordinary venue is never taken for a namesake kilometres away', async () => {
    const { maps } = fakeMaps([[], [hit('elsewhere', 'Café Central', 48.9)]], noName);
    expect(await findEnrichmentMatch(maps, 7, { name: 'Café Central', ...target })).toBeNull();
  });

  it('FORK-ENRICH-013: the address search resolves a place its name finds nothing near', async () => {
    const { maps, searchPlaces } = fakeMaps([[], [], [hit('byAddress', 'Somewhere', 48.8505)]], noName);
    const match = await findEnrichmentMatch(maps, 7, { name: 'Our hotel', address: '1 Rue X, Paris', ...target });
    expect(match?.google_place_id).toBe('byAddress');
    expect(searchPlaces.mock.calls[2][1]).toBe('1 Rue X, Paris');
  });

  it('FORK-ENRICH-014: last, the name OpenStreetMap gives the point is searched near it', async () => {
    const reverse = vi.fn(async () => ({ name: 'Musée Carnavalet', address: null }));
    const { maps, searchPlaces, reverseGeocode } = fakeMaps(
      [[], [], [hit('osm', 'Musée Carnavalet', 48.8503)]],
      reverse,
    );
    expect((await findEnrichmentMatch(maps, 7, { name: 'Museum', ...target }, 'de'))?.google_place_id).toBe('osm');
    expect(reverseGeocode).toHaveBeenCalledWith('48.85', '2.35', 'de', { lane: 'background', timeoutMs: 8000 });
    expect(searchPlaces.mock.calls[2]).toEqual([
      7,
      'Musée Carnavalet',
      'de',
      { ...target, radius: 2000 },
      { googleIdentityOnly: true },
    ]);
  });

  it('FORK-ENRICH-015: a reverse lookup that fails or knows nothing leaves the place unmatched', async () => {
    const down = fakeMaps([], async () => Promise.reject(new Error('nominatim down')));
    await expect(findEnrichmentMatch(down.maps, 7, { name: 'Museum', ...target })).resolves.toBeNull();
    const unknown = fakeMaps([], noName);
    expect(await findEnrichmentMatch(unknown.maps, 7, { name: 'Museum', ...target })).toBeNull();
    expect(unknown.searchPlaces).toHaveBeenCalledTimes(2); // no address, and nothing to search by
  });
});

describe('unlinkedPlaces', () => {
  it('FORK-ENRICH-016: takes the points with no Google identity, never tracks, linked or coordinate-less places', () => {
    const row = (id: number, over: Partial<PlaceRow>) =>
      ({ id, name: `P${id}`, lat: 1, lng: 2, google_place_id: null, route_geometry: null, ...over }) as PlaceRow;
    const rows = [
      row(1, {}),
      row(2, { google_place_id: 'ChIJ' }),
      row(3, { route_geometry: '[[1,2],[3,4]]' }),
      row(4, { lat: null }),
      row(5, { google_place_id: '' }),
      row(6, { lat: 0, lng: 0 }),
    ];
    expect(unlinkedPlaces(rows).map((p) => p.id)).toEqual([1, 5, 6]);
  });
});

describe('through the places module', () => {
  const db = createSnapshotTestDb();
  const maps = {
    getMapsKey: vi.fn(async (): Promise<string | null> => 'key'),
    searchPlaces: vi.fn(async () => ({ source: 'google', places: [] as Record<string, unknown>[] })),
    reverseGeocode: vi.fn(async () => ({ name: null, address: null })),
    getPlacePhoto: vi.fn(async () => ({ photoUrl: null, attribution: null })),
  };
  let t: TestModule;
  const orm = () => t.get(MikroORM);

  beforeAll(async () => {
    t = await createTestModule({ db, imports: [PlacesModule], overrides: [{ provide: MapsService, useValue: maps }] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    maps.getMapsKey.mockImplementation(async () => 'key');
  });
  afterAll(async () => {
    await t.close();
    db.close();
  });

  async function seed() {
    const { user } = await makeUser(orm());
    const trip = await makeTrip(orm(), user.id);
    return { user, trip };
  }

  it('FORK-ENRICH-017: the pass keeps the customer id the search carried, next to the place id', async () => {
    const { user, trip } = await seed();
    const place = await makePlace(orm(), trip.id, { name: 'Bar', lat: 48.85, lng: 2.35 });
    maps.searchPlaces.mockResolvedValueOnce({
      source: 'google',
      places: [hit('ChIJbar', 'Bar', 48.8501, 2.35, { google_cid: '123456789' })],
    });

    await t
      .get(PlacesService)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Bar', lat: 48.85, lng: 2.35 }]);

    expect(await findRow(orm(), Places, { id: place.id })).toMatchObject({
      google_place_id: 'ChIJbar',
      google_cid: '123456789',
    });
  });

  it('FORK-ENRICH-018: a customer id already stored is never overwritten', async () => {
    const { user, trip } = await seed();
    const place = await makePlace(orm(), trip.id, { name: 'Bar', lat: 48.85, lng: 2.35, google_cid: '111' });
    maps.searchPlaces.mockResolvedValueOnce({
      source: 'google',
      places: [hit('ChIJbar', 'Bar', 48.8501, 2.35, { google_cid: '999' })],
    });

    await t
      .get(PlacesService)
      .enrichImportedPlaces(String(trip.id), user.id, [{ id: place.id, name: 'Bar', lat: 48.85, lng: 2.35 }]);

    expect(await findRow(orm(), Places, { id: place.id })).toMatchObject({
      google_place_id: 'ChIJbar',
      google_cid: '111',
    });
  });

  it('FORK-ENRICH-019: the manual pass refuses without a Google key, before anything is searched', async () => {
    const { user, trip } = await seed();
    maps.getMapsKey.mockImplementation(async () => null);
    const queue = vi.spyOn(t.get(PlacesService), 'enrichImportedPlaces');

    const refusal = await t
      .get(PlacesEnrichService)
      .enrichUnlinkedPlaces(String(trip.id), user.id)
      .catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(DomainError);
    expect((refusal as DomainError).getStatus()).toBe(400);
    expect((refusal as DomainError).getResponse()).toEqual({
      error: 'A Google Maps API key is required to enrich places',
    });
    expect(queue).not.toHaveBeenCalled();
  });

  it("FORK-ENRICH-020: with a key it queues the trip's unlinked points and says how many", async () => {
    const { user, trip } = await seed();
    const other = await seed();
    const open = await makePlace(orm(), trip.id, { name: 'Open', lat: 1, lng: 2 });
    await makePlace(orm(), trip.id, { name: 'Linked', google_place_id: 'ChIJx' });
    await makePlace(orm(), trip.id, { name: 'Track', route_geometry: '[[1,2],[3,4]]' });
    await makePlace(orm(), trip.id, { name: 'Nowhere', lat: null, lng: null });
    await makePlace(orm(), other.trip.id, { name: 'Not this trip' });
    const queue = vi.spyOn(t.get(PlacesService), 'enrichImportedPlaces').mockResolvedValue();

    expect(await t.get(PlacesEnrichService).enrichUnlinkedPlaces(String(trip.id), user.id)).toBe(1);

    expect(queue).toHaveBeenCalledWith(String(trip.id), user.id, [
      expect.objectContaining({ id: open.id, name: 'Open' }),
    ]);
  });

  it('FORK-ENRICH-021: a trip with nothing to enrich queues nothing and says so', async () => {
    const { user, trip } = await seed();
    const queue = vi.spyOn(t.get(PlacesService), 'enrichImportedPlaces').mockResolvedValue();
    expect(await t.get(PlacesEnrichService).enrichUnlinkedPlaces(String(trip.id), user.id)).toBe(0);
    expect(queue).toHaveBeenCalledWith(String(trip.id), user.id, []);
  });
});
