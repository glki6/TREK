import type { AssignmentPlace, Place } from '../../types'
import type { MapsUrlPair } from './placeGoogleMaps'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng' | 'google_place_id'>

/**
 * Build a Google Maps URL pair (native comgooglemaps:// + HTTPS fallback).
 *
 * Priority 1: google_place_id → actual place page with reviews, photos, hours.
 * Fallback:   coordinate-based search (for unenriched places / future trips).
 *
 * Replaced Apple Maps (maps://) per workboard card T3-5.
 * Updated to use place name per workboard card T3-8.
 * Updated to include coordinates per workboard card T3-12.
 * Updated to prefer google_place_id for rich place pages per workboard card T3-14.
 */
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
  if (!place) return null

  // Priority 1: Use google_place_id → actual place page with reviews/details
  if (place.google_place_id) {
    return {
      native: `comgooglemaps://?place_id=${place.google_place_id}`,
      https: `https://www.google.com/maps/place/?q=place_id:${place.google_place_id}`,
    }
  }

  // Fallback: coordinate-based search (for unenriched places / future trips)
  if (place.lat != null && place.lng != null) {
    return {
      native: `comgooglemaps://?q=${place.lat},${place.lng}(${encodeURIComponent(place.name)})`,
      https: `https://www.google.com/maps?q=${place.lat},${place.lng}&z=15`,
    }
  }

  return null
}
