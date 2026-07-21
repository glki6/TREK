import type { AssignmentPlace, Place } from '../../types'
import type { MapsUrlPair } from './placeGoogleMaps'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

/**
 * Build an OpenStreetMap URL pair (native comgooglemaps:// + HTTPS fallback).
 * Uses `center=` (not `query=`) so the native Maps app centres on the
 * coordinates instead of treating them as a search string.
 * Replaced Apple Maps (maps://) per workboard card T3-5.
 */
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
  if (!place) return null
  if (place.lat != null && place.lng != null) {
    return {
      native: `comgooglemaps://?center=${place.lat},${place.lng}&zoom=15`,
      https: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}&zoom=15`,
    }
  }
  return null
}
