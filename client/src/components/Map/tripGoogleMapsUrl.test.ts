import { describe, expect, it } from 'vitest'
import { GOOGLE_MAPS_MAX_STOPS, buildTripGoogleMapsRoute } from './tripGoogleMapsUrl'

// FE-MAP-TRIPGMAPS-001 to FE-MAP-TRIPGMAPS-004 (fork-only module)

const at = (n: number) => ({ lat: 48 + n / 100, lng: 2 + n / 100 })
const hotel = { lat: 47.5, lng: 1.5 }

describe('buildTripGoogleMapsRoute', () => {
  it('FE-MAP-TRIPGMAPS-001: joins the days in trip order into one directions link', () => {
    const route = buildTripGoogleMapsRoute([[at(1), at(2)], [at(3)]])
    expect(route).toEqual({ url: 'https://www.google.com/maps/dir/48.01,2.01/48.02,2.02/48.03,2.03', shown: 3, total: 3 })
  })

  it('FE-MAP-TRIPGMAPS-002: the hotel one day ends at and the next starts from is listed once', () => {
    const route = buildTripGoogleMapsRoute([[at(1), hotel], [hotel, at(2)]])
    expect(route.url).toBe('https://www.google.com/maps/dir/48.01,2.01/47.5,1.5/48.02,2.02')
    expect(route.total).toBe(3)
  })

  it('FE-MAP-TRIPGMAPS-003: a trip longer than Google takes is cut at its limit, and says how long it was', () => {
    const stops = Array.from({ length: 14 }, (_, i) => at(i))
    const route = buildTripGoogleMapsRoute([stops.slice(0, 7), stops.slice(7)])
    expect(route.shown).toBe(GOOGLE_MAPS_MAX_STOPS)
    expect(route.total).toBe(14)
    expect(route.url!.split('/dir/')[1].split('/')).toHaveLength(GOOGLE_MAPS_MAX_STOPS)
  })

  it('FE-MAP-TRIPGMAPS-004: a trip with no located stop has nothing to open', () => {
    expect(buildTripGoogleMapsRoute([[], []])).toEqual({ url: null, shown: 0, total: 0 })
  })
})
