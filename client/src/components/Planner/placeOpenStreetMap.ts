import type { AssignmentPlace, Place } from '../../types'
import type { MapsUrlPair } from './placeGoogleMaps'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

/**
 * Build an OpenStreetMap URL pair (native comgooglemaps:// + HTTPS fallback).
 * Uses `lat,lng(name)` format so Google Maps pins to the exact coordinates
 * while still labeling with the place name. Matches placeGoogleMaps.ts pattern.
 * Replaced Apple Maps (maps://) per workboard card T3-5.
 * Updated to use place name per workboard card T3-8.
 * Updated to include coordinates per workboard card T3-12.
 */
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
  if (!place) return null
  if (place.lat != null && place.lng != null) {
    return {
      native: `comgooglemaps://?q=${place.lat},${place.lng}(${encodeURIComponent(place.name)})`,
      https: `https://www.google.com/maps?q=${place.lat},${place.lng}&z=15`,
    }
  }
  return null
}
