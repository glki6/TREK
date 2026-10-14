import { describe, it, expect, vi } from 'vitest'
import { getGoogleMapsUrlForPlace, openMapsFallback } from './placeGoogleMaps'

const base = { lat: 48.8584, lng: 2.2945 } as any

describe('getGoogleMapsUrlForPlace', () => {
  it('FE-PLACE-GMAPS-001: returns MapsUrlPair with native + https for a place with coordinates', () => {
    const pair = getGoogleMapsUrlForPlace(base)
    expect(pair).toEqual({
      native: 'comgooglemaps://?daddr=48.8584,2.2945',
      https: 'https://www.google.com/maps?q=48.8584,2.2945&z=15',
    })
  })

  it('FE-PLACE-GMAPS-002: keeps coordinate 0 (falsy but valid)', () => {
    const pair = getGoogleMapsUrlForPlace({ lat: 0, lng: 0 })
    expect(pair).toEqual({
      native: 'comgooglemaps://?daddr=0,0',
      https: 'https://www.google.com/maps?q=0,0&z=15',
    })
  })

  it('FE-PLACE-GMAPS-003: returns null for no place or no location', () => {
    expect(getGoogleMapsUrlForPlace(null)).toBeNull()
    expect(getGoogleMapsUrlForPlace(undefined)).toBeNull()
    expect(getGoogleMapsUrlForPlace({ lat: null, lng: null })).toBeNull()
  })
})

describe('openMapsFallback', () => {
  it('FE-PLACE-GMAPS-004: opens native URL immediately, then falls back to HTTPS after timeout', async () => {
    const mockOpen = vi.fn()
    const mockLocation = { href: '' } as any
    const mockDocument = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const pair = getGoogleMapsUrlForPlace(base)!
    openMapsFallback(pair, 50, mockOpen, mockLocation, mockDocument)

    expect(mockLocation.href).toBe(pair.native)
    expect(mockOpen).not.toHaveBeenCalled()

    await new Promise(r => setTimeout(r, 100))
    expect(mockOpen).toHaveBeenCalledWith(pair.https, '_blank')
  })

  it('FE-PLACE-GMAPS-005: skips fallback when visibility changes (native handler took over)', async () => {
    const mockOpen = vi.fn()
    const mockLocation = { href: '' } as any
    let changeHandler: (() => void) | null = null
    const mockDocument = {
      visibilityState: 'visible',
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        changeHandler = handler
      }),
      removeEventListener: vi.fn(),
    }

    const pair = getGoogleMapsUrlForPlace(base)!
    openMapsFallback(pair, 50, mockOpen, mockLocation, mockDocument)

    // Simulate visibility change (app switch)
    mockDocument.visibilityState = 'hidden'
    changeHandler?.()

    await new Promise(r => setTimeout(r, 100))
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('FE-PLACE-GMAPS-006: does nothing when pair is null', () => {
    const mockOpen = vi.fn()
    openMapsFallback(null, 0, mockOpen, {} as any, {} as any)
    expect(mockOpen).not.toHaveBeenCalled()
  })
})
