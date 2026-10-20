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
 * Whether the Google Maps app's own scheme exists here. `comgooglemaps://` is the iOS
 * app's: Google Maps on Android never registered it (an https link already opens the
 * app there, through the plain Google Maps entry) and a desktop has no app to open.
 * iPadOS 13 and later say "Macintosh", so touch is what tells an iPad from a Mac.
 */
export function offersGoogleMapsApp(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
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
 * Try opening the native Maps URL; if the page is still in front after `timeoutMs`
 * (no app took over), open the HTTPS fallback in a new tab instead. The page being
 * hidden or put away means the app took over. Losing focus does not: Safari's own
 * "cannot open page" alert takes it when the app is missing, which is exactly when
 * the fallback is wanted.
 */
export function openMapsFallback(
  pair: MapsUrlPair | null,
  timeoutMs = 1500,
  open = window.open,
  location = window.location,
  document = globalThis.document,
): void {
  if (!pair) return

  let handedOver = false
  const view = document.defaultView
  const stopWatching = () => {
    document.removeEventListener('visibilitychange', onVisibility)
    view?.removeEventListener('pagehide', onLeave)
  }
  const onLeave = () => {
    handedOver = true
    stopWatching()
  }
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') onLeave()
  }

  document.addEventListener('visibilitychange', onVisibility)
  view?.addEventListener('pagehide', onLeave)

  setTimeout(() => {
    if (handedOver) return
    stopWatching()
    open(pair.https, '_blank', 'noopener,noreferrer')
  }, timeoutMs)

  location.href = pair.native
}
