/**
 * Fork-only: the Google Maps customer id (CID) of a place.
 *
 * The Places API hands it over inside `googleMapsUri` (`https://maps.google.com/?cid=…`)
 * and upstream keeps only an ftid from that URI, which this URI never carries. A link
 * built on the CID opens the place itself in the Google Maps app on iOS, where a
 * place-id search link can land on a list of namesakes instead.
 */

/** A CID is an unsigned 64-bit integer, written in decimal. */
const CID_RE = /^\d{1,20}$/;

export function googleCidFromMapsUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const cid = new URL(url).searchParams.get('cid')?.trim();
    return cid && CID_RE.test(cid) ? cid : null;
  } catch {
    return null;
  }
}
