import type { AssignmentPlace, Place } from '../../types'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

// Open a place in Google Maps search mode so the user can look around the
// coordinates. Falls back to null when the place has no coordinates.
// Replaced Apple Maps (maps://) per workboard card T3-5.
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): string | null {
  if (!place) return null
  if (place.lat != null && place.lng != null) {
    return `comgooglemaps://?query=${place.lat},${place.lng}`
  }
  return null
}
