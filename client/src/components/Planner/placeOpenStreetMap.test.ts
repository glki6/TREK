import { describe, it, expect } from 'vitest'
import { getOpenStreetMapUrlForPlace } from './placeOpenStreetMap'

const base = { name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945 } as any

describe('getOpenStreetMapUrlForPlace', () => {
  it('FE-PLACE-OSM: prefers google_cid over google_place_id', () => {
    const place = { id: 1, name: 'Test Place', lat: 51.0, lng: -114.0, google_place_id: 'ChIJx', google_cid: '12345' } as any;
    const result = getOpenStreetMapUrlForPlace(place);
    expect(result).not.toBeNull();
    expect(result!.native).toContain('cid=12345');
  });

  it('FE-PLACE-OSM: falls back to place_id when google_cid is null', () => {
    const place = { id: 1, name: 'Test Place', lat: 51.0, lng: -114.0, google_place_id: 'ChIJabcdef', google_cid: null } as any;
    const result = getOpenStreetMapUrlForPlace(place);
    expect(result).not.toBeNull();
    expect(result!.native).toContain('place_id:ChIJabcdef');
  });

  it('FE-PLACE-OSM: returns HTTPS URLs for place_id (native scheme unreliable on mobile)', () => {
    const pair = getOpenStreetMapUrlForPlace({
      ...base,
      google_place_id: 'ChIjFhWFFG6AhUQRKz9fR8MjQ',
    })
const httpsUrl = 'https://www.google.com/maps/place/?q=place_id:ChIjFhWFFG6AhUQRKz9fR8MjQ'
    expect(pair).toEqual({ native: httpsUrl, https: httpsUrl })
  })

  it('FE-PLACE-OSM: prefers google_place_id over coordinates', () => {
    const pair = getOpenStreetMapUrlForPlace({
      name: 'Some Place',
      lat: 51.1, lng: -1.1,
      google_place_id: 'ChIJabcdef123',
    })
    expect(pair!.native).toContain('place_id:ChIJabcdef123')
    expect(pair!.https).toContain('place_id:ChIJabcdef123')
    expect(pair!.native).not.toContain('51.1')
  })

  it('FE-PLACE-OSM: falls back to coordinates when google_place_id is null', () => {
    const pair = getOpenStreetMapUrlForPlace({
      ...base,
      google_place_id: null,
    })
    expect(pair).toEqual({
native: `comgooglemaps://?q=48.8584,2.2945(${encodeURIComponent('Eiffel Tower')})`,
https: 'https://www.google.com/maps?q=48.8584,2.2945&z=15',
    })
  })

  it('FE-PLACE-OSM: falls back to coordinates when google_place_id is undefined', () => {
    const pair = getOpenStreetMapUrlForPlace(base)
    expect(pair).toEqual({
native: `comgooglemaps://?q=48.8584,2.2945(${encodeURIComponent('Eiffel Tower')})`,
https: 'https://www.google.com/maps?q=48.8584,2.2945&z=15',
    })
  })

  it('FE-PLACE-OSM: keeps coordinate 0 (falsy but valid) in fallback path', () => {
    const pair = getOpenStreetMapUrlForPlace({ name: 'Null Island', lat: 0, lng: 0 })
    expect(pair).toEqual({
native: `comgooglemaps://?q=0,0(${encodeURIComponent('Null Island')})`,
https: 'https://www.google.com/maps?q=0,0&z=15',
    })
  })

  it('FE-PLACE-OSM: returns null when there are no coordinates and no place_id', () => {
    expect(getOpenStreetMapUrlForPlace({ name: 'Café René', lat: null, lng: null })).toBeNull()
  })

  it('FE-PLACE-OSM: returns null with neither coordinates nor a place_id (null/undefined guards)', () => {
    expect(getOpenStreetMapUrlForPlace({ name: '', lat: null, lng: null })).toBeNull()
    expect(getOpenStreetMapUrlForPlace(null)).toBeNull()
    expect(getOpenStreetMapUrlForPlace(undefined)).toBeNull()
  })
})
