import type { Accommodation, AssignmentsMap, Day, Place, Waypoint } from '../../types'
import { getDayBookendHotels } from '../../utils/dayOrder'
import { generateGoogleMapsUrl } from './RouteCalculator'

/**
 * Fork-only: open the whole itinerary in Google Maps in one go.
 *
 * Kept out of RouteCalculator.ts so that file can track upstream without conflicts.
 */

/**
 * Build a Google Maps directions URL for ALL stops across ALL days of a trip,
 * including hotel bookends. Useful for opening the entire itinerary in one go.
 */
export function buildTripGoogleMapsUrl(
  days: Day[],
  assignments: AssignmentsMap,
  accommodations: Accommodation[],
): string | null {
  const allStops: Waypoint[] = []

  for (const day of days) {
    // Get hotel bookends for this day via the same helper used by the per-day export
    const bookends = getDayBookendHotels(day, days, accommodations)

    // Add morning hotel if it has coordinates
    if (bookends?.morning?.place_lat != null && bookends.morning.place_lng != null) {
      allStops.push({ lat: bookends.morning.place_lat, lng: bookends.morning.place_lng })
    }

    // Add all places from this day in planned order (sorted on a copy: the store's
    // arrays must not be reordered in place)
    const dayPlaces = [...(assignments[String(day.id)] || [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map(a => a.place as Place | undefined)
      .filter(p => p?.lat != null && p?.lng != null) as Waypoint[]
    allStops.push(...dayPlaces)

    // Add evening hotel if it exists and differs from the last stop already added
    if (bookends?.evening?.place_lat != null && bookends.evening.place_lng != null) {
      const lastStop = allStops[allStops.length - 1]
      if (!lastStop || !(lastStop.lat === bookends.evening.place_lat && lastStop.lng === bookends.evening.place_lng)) {
        allStops.push({ lat: bookends.evening.place_lat, lng: bookends.evening.place_lng })
      }
    }
  }

  return generateGoogleMapsUrl(allStops)
}
