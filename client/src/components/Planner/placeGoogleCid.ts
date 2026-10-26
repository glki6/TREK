import type { AssignmentPlace, Place } from '../../types';

/**
 * Fork-only: the Google Maps customer id (CID) of a place, and the link built on it.
 *
 * A `maps.google.com/?cid=` link opens the place itself in the Google Maps app on iOS,
 * where the place-id search link can land on a list of namesakes instead. Two sources:
 *
 *   1. `google_cid` — stored by list-import enrichment (server google-cid.ts);
 *   2. the details URL — the Places API's `googleMapsUri` is a `?cid=` link.
 *
 * A place with neither keeps upstream's link, ftid first.
 */

type PlaceLike = Pick<Place | AssignmentPlace, 'google_cid'>;

/** An unsigned 64-bit integer in decimal. */
const CID_RE = /^\d{1,20}$/;

function cidFromUrl(url: string): string | null {
  let cid: string | null;
  try {
    cid = new URL(url).searchParams.get('cid');
  } catch {
    return null; // not a URL at all, so there is no id in it
  }
  return cid && CID_RE.test(cid) ? cid : null;
}

export function googleCidOf(place: PlaceLike, detailsUrl?: string | null): string | null {
  const stored = place.google_cid?.trim();
  if (stored && CID_RE.test(stored)) return stored;
  return detailsUrl ? cidFromUrl(detailsUrl) : null;
}

export function googleMapsCidUrl(cid: string): string {
  return `https://maps.google.com/?cid=${cid}`;
}
