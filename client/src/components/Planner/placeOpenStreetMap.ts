import type { AssignmentPlace, Place } from '../../types'
import type { MapsUrlPair } from './placeGoogleMaps'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

/**
 * Build an OpenStreetMap URL pair (native comgooglemaps:// + HTTPS fallback).
 * Uses `q=` so the native Maps app searches for the place name and opens
 * the actual place, rather than just centering the map on coordinates.
 * Replaced Apple Maps (maps://) per workboard card T3-5.
 * Updated to use place name per workboard card T3-8.
 */
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
  if (!place) return null
  if (place.lat != null && place.lng != null) {
    return {
      native: `comgooglemaps://?q=${encodeURIComponent(place.name)}`,
      https: `https://www.google.com/maps?q=${place.lat},${place.lng}(${encodeURIComponent(place.name)})&z=15`,
    }
  }
  return null
}
