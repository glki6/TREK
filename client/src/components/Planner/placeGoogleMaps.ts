import type { AssignmentPlace, Place } from '../../types'

type PlaceLike = Pick<Place | AssignmentPlace, 'lat' | 'lng'>

export function getGoogleMapsUrlForPlace(place: PlaceLike | null | undefined): string | null {
  if (!place) return null
  if (place.lat == null || place.lng == null) return null
  return `comgooglemaps://?daddr=${place.lat},${place.lng}`
}
