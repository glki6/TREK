import type { AssignmentPlace, Place } from '../../types'
import type { MapsUrlPair } from './placeGoogleMaps'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng' | 'google_place_id' | 'google_cid'>

/**
 * Build a Google Maps URL pair (native comgooglemaps:// + HTTPS fallback).
 *
 * Priority 1: google_cid → works on iOS (no Universal Links issue), opens rich place page.
 * Priority 2: google_place_id → actual place page with reviews, photos, hours.
 * Fallback:   coordinate-based search (for unenriched places / future trips).
 *
 * History: replaced maps:// scheme → HTTPS URLs; added place name &amp; coords;
 * prefers google_place_id for rich pages; now prefers google_cid (fixes iOS). */
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
  if (!place) return null

  // Priority 1: google_cid → works on iOS (no Universal Links issue)
  if (place.google_cid) {
const url = `https://maps.google.com/?cid=${place.google_cid}`;
    return { native: url, https: url }
  }

  // Priority 2: Use google_place_id → actual place page with reviews/details
  // Note: comgooglemaps:// doesn't reliably handle place_id queries on mobile,
  // so we use the HTTPS URL for both (it opens Google Maps properly everywhere).
  if (place.google_place_id) {
const url = `https://www.google.com/maps/place/?q=place_id:${place.google_place_id}`;
    return { native: url, https: url }
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
