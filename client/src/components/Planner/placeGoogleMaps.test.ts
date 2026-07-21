import { describe, it, expect } from 'vitest'
import { getGoogleMapsUrlForPlace } from './placeGoogleMaps'

const base = { lat: 48.8584, lng: 2.2945 } as any

describe('getGoogleMapsUrlForPlace', () => {
  it('FE-PLACE-GMAPS-001: generates comgooglemaps URI for a place with coordinates', () => {
    const url = getGoogleMapsUrlForPlace(base)
    expect(url).toBe('comgooglemaps://?daddr=48.8584,2.2945')
  })

  it('FE-PLACE-GMAPS-002: keeps coordinate 0 (falsy but valid)', () => {
    const url = getGoogleMapsUrlForPlace({ lat: 0, lng: 0 })
    expect(url).toBe('comgooglemaps://?daddr=0,0')
  })

  it('FE-PLACE-GMAPS-003: returns null for no place or no location', () => {
    expect(getGoogleMapsUrlForPlace(null)).toBeNull()
    expect(getGoogleMapsUrlForPlace(undefined)).toBeNull()
    expect(getGoogleMapsUrlForPlace({ lat: null, lng: null })).toBeNull()
  })
})
