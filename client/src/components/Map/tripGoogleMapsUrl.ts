import type { Waypoint } from '../../types';
import { generateGoogleMapsUrl } from './RouteCalculator';

/**
 * Fork-only: the whole itinerary as one Google Maps route.
 *
 * Kept out of RouteCalculator.ts so that file can track upstream without conflicts.
 */

/** A Google Maps route takes this many stops at most, the start and the end included. */
export const GOOGLE_MAPS_MAX_STOPS = 10;

/**
 * Join every day's export stops (DayPlanSidebar's `dayExportStops`, so the hotel legs
 * follow the same rules as each day's own export) into one route, in trip order. The
 * hotel a day ends at and the next day starts from is listed once. Google opens at
 * most GOOGLE_MAPS_MAX_STOPS stops, so a longer trip is cut there; `total` says how
 * many the whole trip had, so the caller can say what was left out.
 */
export function buildTripGoogleMapsRoute(stopsByDay: Waypoint[][]): {
  url: string | null;
  shown: number;
  total: number;
} {
  const stops: Waypoint[] = [];
  for (const stop of stopsByDay.flat()) {
    const last = stops[stops.length - 1];
    if (last && last.lat === stop.lat && last.lng === stop.lng) continue;
    stops.push(stop);
  }
  const shown = stops.slice(0, GOOGLE_MAPS_MAX_STOPS);
  return { url: generateGoogleMapsUrl(shown), shown: shown.length, total: stops.length };
}
