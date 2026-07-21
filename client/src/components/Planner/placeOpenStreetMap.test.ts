import { describe, it, expect } from 'vitest'
import { getOpenStreetMapUrlForPlace } from './placeOpenStreetMap'

const base = { name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945 } as any

describe('getOpenStreetMapUrlForPlace', () => {
  it('FE-PLACE-OSM-T314-001: returns place_id URLs when google_place_id is present (T3-14)', () => {
    const pair = getOpenStreetMapUrlForPlace({
      ...base,
      google_place_id: 'ChIjFhWFFG6AhUQRKz9fR8MjQ',
    })
    expect(pair).toEqual({
      native: 'comgooglemaps://?place_id=ChIjFhWFFG6AhUQRKz9fR8MjQ',
      https: 'https://www.google.com/maps/place/?q=place_id:ChIjFhWFFG6AhUQRKz9fR8MjQ',
    })
  })

  it('FE-PLACE-OSM-T314-002: prefers google_place_id over coordinates (T3-14)', () => {
    const pair = getOpenStreetMapUrlForPlace({
      name: 'Some Place',
      lat: 51.1, lng: -1.1,
      google_place_id: 'ChIJabcdef123',
    })
    expect(pair!.native).toContain('place_id=ChIJabcdef123')
    expect(pair!.https).toContain('place_id:ChIJabcdef123')
    expect(pair!.native).not.toContain('51.1')
  })

  it('FE-PLACE-OSM-T314-003: falls back to coordinates when google_place_id is null (T3-14)', () => {
    const pair = getOpenStreetMapUrlForPlace({
      ...base,
      google_place_id: null,
    })
    expect(pair).toEqual({
      native: `comgooglemaps://?q=48.8584,2.2945(${encodeURIComponent('Eiffel Tower')})`,
      https: 'https://www.google.com/maps?q=48.8584,2.2945&z=15',
    })
  })

  it('FE-PLACE-OSM-T314-004: falls back to coordinates when google_place_id is undefined (T3-14)', () => {
    const pair = getOpenStreetMapUrlForPlace(base)
    expect(pair).toEqual({
      native: `comgooglemaps://?q=48.8584,2.2945(${encodeURIComponent('Eiffel Tower')})`,
      https: 'https://www.google.com/maps?q=48.8584,2.2945&z=15',
    })
  })

  it('FE-PLACE-OSM-T314-005: keeps coordinate 0 (falsy but valid) in fallback path', () => {
    const pair = getOpenStreetMapUrlForPlace({ name: 'Null Island', lat: 0, lng: 0 })
    expect(pair).toEqual({
      native: `comgooglemaps://?q=0,0(${encodeURIComponent('Null Island')})`,
      https: 'https://www.google.com/maps?q=0,0&z=15',
    })
  })

  it('FE-PLACE-OSM-T314-006: returns null when there are no coordinates and no place_id', () => {
    expect(getOpenStreetMapUrlForPlace({ name: 'Café René', lat: null, lng: null })).toBeNull()
  })

  it('FE-PLACE-OSM-T314-007: returns null with neither coordinates nor a place_id (null/undefined guards)', () => {
    expect(getOpenStreetMapUrlForPlace({ name: '', lat: null, lng: null })).toBeNull()
    expect(getOpenStreetMapUrlForPlace(null)).toBeNull()
    expect(getOpenStreetMapUrlForPlace(undefined)).toBeNull()
  })
})
