import type { PlaceRow } from '../../db/repositories/Places.repository';
import type { MapsService } from '../maps/maps.service';
import { SEARCH_BIAS_RADIUS_METERS, pickEnrichmentMatch, type EnrichablePlace } from './places.helpers';

/**
 * Fork-only: how the import enrichment finds an imported point on Google, and which
 * places a manual enrich pass takes. `PlacesService.enrichOne` hands its search to
 * `findEnrichmentMatch`; everything else here is this fork's. Kept out of
 * places.service.ts and places.helpers.ts so those files can track upstream.
 */

type Candidate = Record<string, unknown>;
type Point = { lat: number; lng: number };

/**
 * Words that name a natural/geographic feature (larger extent → wider tolerance).
 * Whole words only: as substrings they caught "Cambridge" (bridge), "Lakeside Inn"
 * (lake) and "Compass Café" (pass), and widened the match for ordinary venues.
 */
const NATURAL_FEATURE_RE =
  /\b(?:lakes?|glaciers?|falls|waterfalls?|canyons?|peaks?|mountains?|rivers?|cliffs?|bridges?|viewpoints?|trails?|pass(?:es)?|plateaus?|plateaux)\b/i;

export function isNaturalFeature(name: string): boolean {
  return NATURAL_FEATURE_RE.test(name);
}

/**
 * How far an exact-name hit may sit from a natural feature's imported point.
 *
 * A pin saved on a lake or a peak is often a viewpoint or a car park kilometres from
 * the centre Google stores, so there the name is better evidence than the distance.
 * But a name alone is not enough: many lakes and falls share one, and a search with
 * no location bias ranks the famous namesake first, so without a bound "Mirror Lake"
 * in Oregon became the one in Yosemite.
 */
export const EXACT_NAME_MAX_METERS = 50_000;

const sameName = (a: unknown, b: string): boolean =>
  typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The match for a natural feature: a Google hit with exactly its name, the closest up to
 * EXACT_NAME_MAX_METERS away, wins over a nearer one with another name (the lodge beside
 * a lake is closer to a shoreline pin than the lake's own centre); else any hit within
 * the wide bias radius.
 */
export function pickNaturalFeatureMatch(candidates: Candidate[], target: Point, name: string): Candidate | null {
  const namesakes = (candidates || []).filter((c) => sameName(c.name, name));
  return (
    pickEnrichmentMatch(namesakes, target, EXACT_NAME_MAX_METERS) ??
    pickEnrichmentMatch(candidates, target, SEARCH_BIAS_RADIUS_METERS)
  );
}

export type EnrichmentMaps = Pick<MapsService, 'searchPlaces' | 'reverseGeocode'>;

/**
 * The Google place an imported point stands for, or null. Upstream's search comes
 * first (the name, biased to the point, asked for a Google identity), with a natural
 * feature matched as above. Each fallback runs only when everything before it found
 * nothing: the name without the bias, the place's address, and the name Nominatim
 * gives the point (on the throttled background lane). The last two keep the tight
 * match radius, whatever kind of place it is.
 */
export async function findEnrichmentMatch(
  maps: EnrichmentMaps,
  userId: number,
  place: Pick<EnrichablePlace, 'name' | 'lat' | 'lng' | 'address'>,
  lang?: string,
): Promise<Candidate | null> {
  const target = { lat: place.lat, lng: place.lng };
  const identityOnly = { googleIdentityOnly: true };
  const pick = isNaturalFeature(place.name)
    ? (candidates: Candidate[]) => pickNaturalFeatureMatch(candidates, target, place.name)
    : (candidates: Candidate[]) => pickEnrichmentMatch(candidates, target);
  const search = async (query: string, bias?: Point & { radius: number }) =>
    (await maps.searchPlaces(userId, query, lang, bias, identityOnly)).places;

  const biased = pick(await search(place.name, { ...target, radius: SEARCH_BIAS_RADIUS_METERS }));
  if (biased) return biased;
  const wide = pick(await search(place.name));
  if (wide) return wide;
  if (place.address) {
    const byAddress = pickEnrichmentMatch(await search(place.address), target);
    if (byAddress) return byAddress;
  }
  return await matchByReverseGeocode(maps, target, search, lang);
}

async function matchByReverseGeocode(
  maps: EnrichmentMaps,
  target: Point,
  search: (query: string, bias?: Point & { radius: number }) => Promise<Candidate[]>,
  lang?: string,
): Promise<Candidate | null> {
  let name: string | null;
  try {
    ({ name } = await maps.reverseGeocode(String(target.lat), String(target.lng), lang, {
      lane: 'background',
      timeoutMs: 8000,
    }));
  } catch {
    return null; // Nominatim is down or slow: the place stays as imported, like no match at all
  }
  if (!name) return null;
  return pickEnrichmentMatch(await search(name, { ...target, radius: SEARCH_BIAS_RADIUS_METERS }), target);
}

/**
 * The places of a trip a manual enrich pass takes: no Google identity yet, a point
 * rather than a track imported from a GPX/KML file (a line, which looking up by its
 * name finds a stranger), and coordinates to match against.
 */
export function unlinkedPlaces(rows: PlaceRow[]): EnrichablePlace[] {
  const out: EnrichablePlace[] = [];
  for (const row of rows) {
    if (row.google_place_id || row.route_geometry || row.lat == null || row.lng == null) continue;
    out.push({ ...row, lat: row.lat, lng: row.lng });
  }
  return out;
}
