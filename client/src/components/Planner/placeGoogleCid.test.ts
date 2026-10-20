import { describe, expect, it } from 'vitest'
import { googleCidOf, googleMapsCidUrl } from './placeGoogleCid'
import { getGoogleMapsUrlForPlace } from './placeGoogleMaps'
import { getNavigationTargets } from './placeNavigation'
import type { Place } from '../../types'

// FE-PLACE-GCID-001 to FE-PLACE-GCID-006 (fork-only module)

const FTID = '0x47e66e2964e34e2d:0x8ddca9ee380ef7e0'
const base = { name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945, google_place_id: null, google_ftid: null, google_cid: null } as unknown as Place

describe('googleCidOf', () => {
  it('FE-PLACE-GCID-001: a stored customer id is used as it is', () => {
    expect(googleCidOf({ google_cid: ' 10222232094831998944 ' })).toBe('10222232094831998944')
  })

  it('FE-PLACE-GCID-002: otherwise the one in the Places API details URL', () => {
    expect(googleCidOf({ google_cid: null }, 'https://maps.google.com/?cid=777&g_mp=x')).toBe('777')
  })

  it('FE-PLACE-GCID-003: anything that is not a decimal id is no id at all', () => {
    expect(googleCidOf({ google_cid: '12&q=evil' })).toBeNull()
    expect(googleCidOf({ google_cid: null }, 'not a url')).toBeNull()
    expect(googleCidOf({ google_cid: null }, 'https://maps.google.com/?q=48.8,2.3')).toBeNull()
    expect(googleCidOf({ google_cid: null }, 'https://maps.google.com/?cid=0x12')).toBeNull()
    expect(googleCidOf({ google_cid: null })).toBeNull()
  })
})

describe('the Google Maps link with a customer id', () => {
  it('FE-PLACE-GCID-004: a stored id wins over the ftid and the place id', () => {
    const place = { ...base, google_cid: '10222232094831998944', google_ftid: FTID, google_place_id: 'ChIJ' }
    expect(getGoogleMapsUrlForPlace(place)).toBe(googleMapsCidUrl('10222232094831998944'))
    expect(getNavigationTargets(place).find(t => t.id === 'google')!.url).toBe('https://maps.google.com/?cid=10222232094831998944')
  })

  it('FE-PLACE-GCID-005: the details URL\'s id wins over the place-id search link', () => {
    expect(getGoogleMapsUrlForPlace({ ...base, google_place_id: 'ChIJ' }, 'https://maps.google.com/?cid=777')).toBe('https://maps.google.com/?cid=777')
  })

  it('FE-PLACE-GCID-006: without an id the link is upstream\'s, ftid first', () => {
    expect(getGoogleMapsUrlForPlace({ ...base, google_ftid: FTID })).toBe(`https://www.google.com/maps/place/?q=Eiffel%20Tower&ftid=${FTID}`)
    expect(getGoogleMapsUrlForPlace({ ...base, google_cid: 'abc', google_place_id: 'ChIJ' })).toBe('https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower&query_place_id=ChIJ')
  })
})
