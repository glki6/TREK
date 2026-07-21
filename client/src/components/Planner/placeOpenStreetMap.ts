import type { AssignmentPlace, Place } from '../../types'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

// Open a place in the system maps app (Apple Maps on iOS, default maps on Android)
// with a marker at its coordinates. Falls back to null when the place has no
// coordinates. Requested in discussion #880.
export function getOpenStreetMapUrlForPlace(place: PlaceLike | null | undefined): string | null {
  if (!place) return null
  if (place.lat != null && place.lng != null) {
    return `maps://?daddr=${place.lat},${place.lng}`
  }
  return null
}
