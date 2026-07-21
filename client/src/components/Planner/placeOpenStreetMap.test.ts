import { describe, it, expect } from 'vitest'
import { getOpenStreetMapUrlForPlace } from './placeOpenStreetMap'

const base = { name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945 } as any

describe('getOpenStreetMapUrlForPlace', () => {
  it('FE-PLACE-OSM-001: generates comgooglemaps://?query= URI for a place with coordinates', () => {
    const url = getOpenStreetMapUrlForPlace(base)
    expect(url).toBe('comgooglemaps://?query=48.8584,2.2945')
  })

  it('FE-PLACE-OSM-002: keeps coordinate 0 (falsy but valid)', () => {
    const url = getOpenStreetMapUrlForPlace({ name: 'Null Island', lat: 0, lng: 0 })
    expect(url).toBe('comgooglemaps://?query=0,0')
  })

  it('FE-PLACE-OSM-003: returns null when there are no coordinates', () => {
    expect(getOpenStreetMapUrlForPlace({ name: 'Café René', lat: null, lng: null })).toBeNull()
  })

  it('FE-PLACE-OSM-004: returns null with neither coordinates nor a name', () => {
    expect(getOpenStreetMapUrlForPlace({ name: '', lat: null, lng: null })).toBeNull()
    expect(getOpenStreetMapUrlForPlace(null)).toBeNull()
    expect(getOpenStreetMapUrlForPlace(undefined)).toBeNull()
  })
})
