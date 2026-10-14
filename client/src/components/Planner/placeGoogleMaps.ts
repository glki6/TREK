import type { AssignmentPlace, Place } from '../../types'

type PlaceLike = Pick<Place | AssignmentPlace, 'lat' | 'lng' | 'google_place_id'>

/** URL pair returned by the map helpers: native app scheme + HTTPS fallback*/
export interface MapsUrlPair {
  native: string
  https: string
}

/** Build a Google Maps URL pair (native comgooglemaps:// + HTTPS fallback).*/
export function getGoogleMapsUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
  if (!place) return null
  if (place.lat == null || place.lng == null) return null
  return {
    native: `comgooglemaps://?daddr=${place.lat},${place.lng}`,
    https: `https://www.google.com/maps?q=${place.lat},${place.lng}&z=15`,
  }
}

/**
 * Try opening the native Maps URL; if the page is still alive after
 * `timeoutMs` (meaning no native handler intercepted), open the HTTPS
 * fallback in a new tab instead.
*/
export function openMapsFallback(
  pair: MapsUrlPair | null,
  timeoutMs = 1500,
  open = window.open,
  location = window.location,
  document = globalThis.document,
): void {
  if (!pair) return

  let cleared = false
  const handler = () => {
    if (document.visibilityState !== 'visible') {
      cleared = true
      document.removeEventListener('visibilitychange', handler)
    }
  }

  document.addEventListener('visibilitychange', handler)

  const tid = setTimeout(() => {
    if (!cleared) {
      document.removeEventListener('visibilitychange', handler)
      open(pair.https, '_blank')
    }
  }, timeoutMs)

  location.href = pair.native

  // Safety: if the page navigates away, the timeout is abandoned.
  // If it stays (no handler), the timeout fires and opens the fallback.
}
