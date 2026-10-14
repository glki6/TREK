import type { AssignmentPlace, Place } from '../../types'

/**
 * Fork-only: opening the installed Google Maps app via its native URI scheme.
 *
 * Lives in its own file (rather than in placeGoogleMaps.ts) so upstream changes to
 * the Google link builder never conflict with it. `getNavigationTargets` in
 * placeNavigation.ts offers this as the "Google Maps app" entry.
 */

type PlaceLike = Pick<Place | AssignmentPlace, 'lat' | 'lng'>

/** URL pair: native app scheme + HTTPS fallback. */
export interface MapsUrlPair {
  native: string
  https: string
}

/**
 * Build the Google Maps app URL pair (`comgooglemaps://` + HTTPS fallback).
 * The native scheme starts directions to the coordinates and works with no signal.
 */
export function getGoogleMapsAppUrlForPlace(place: PlaceLike | null | undefined): MapsUrlPair | null {
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

  setTimeout(() => {
    if (!cleared) {
      document.removeEventListener('visibilitychange', handler)
      open(pair.https, '_blank')
    }
  }, timeoutMs)

  location.href = pair.native
  // If the page navigates away the timeout is abandoned; if it stays (no handler
  // installed) the timeout fires and opens the fallback.
}
