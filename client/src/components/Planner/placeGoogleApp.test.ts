import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGoogleMapsAppUrlForPlace, offersGoogleMapsApp, openMapsFallback } from './placeGoogleApp'
import { getNavigationTargets, openNavigationTarget } from './placeNavigation'
import type { Place } from '../../types'

// FE-PLANNER-GAPP-001 to FE-PLANNER-GAPP-011 (fork-only module)

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9)'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

function place(overrides: Partial<Place> = {}): Place {
  return { name: 'Stephansdom', lat: 48.2038, lng: 16.3616, google_place_id: null, google_ftid: null, ...overrides } as unknown as Place
}

/** Same trick as placeNavigation.test.ts: shadow the prototype getters, then delete them again. */
function withDevice(ua: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
  return () => {
    delete (navigator as unknown as Record<string, unknown>).userAgent
    delete (navigator as unknown as Record<string, unknown>).maxTouchPoints
  }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('offersGoogleMapsApp', () => {
  it('FE-PLANNER-GAPP-001: iPhones and iPads have the comgooglemaps:// scheme', () => {
    for (const ua of [IPHONE, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)']) {
      const restore = withDevice(ua)
      try { expect(offersGoogleMapsApp(), ua).toBe(true) } finally { restore() }
    }
  })

  it('FE-PLANNER-GAPP-002: an iPad calling itself a Mac is told apart by touch', () => {
    let restore = withDevice(MAC, 5)
    try { expect(offersGoogleMapsApp()).toBe(true) } finally { restore() }
    restore = withDevice(MAC, 0)
    try { expect(offersGoogleMapsApp()).toBe(false) } finally { restore() }
  })

  it('FE-PLANNER-GAPP-003: Android and desktops have no such app to open', () => {
    for (const ua of [ANDROID, WINDOWS]) {
      const restore = withDevice(ua)
      try { expect(offersGoogleMapsApp(), ua).toBe(false) } finally { restore() }
    }
  })
})

describe('the "Google Maps app" navigation entry', () => {
  it('FE-PLANNER-GAPP-004: on an iPhone it sits right after Google Maps, as the native scheme with a web fallback', () => {
    const restore = withDevice(IPHONE)
    try {
      const targets = getNavigationTargets(place())
      expect(targets.map(t => t.id).slice(0, 2)).toEqual(['google', 'google-app'])
      expect(targets[1]).toEqual({
        id: 'google-app',
        label: 'Google Maps app',
        url: 'comgooglemaps://?daddr=48.2038,16.3616',
        fallbackUrl: 'https://www.google.com/maps?q=48.2038,16.3616&z=15',
      })
    } finally { restore() }
  })

  it('FE-PLANNER-GAPP-005: an Android phone does not get it — the plain Google Maps entry opens the app there', () => {
    const restore = withDevice(ANDROID)
    try { expect(getNavigationTargets(place()).map(t => t.id)).not.toContain('google-app') } finally { restore() }
  })

  it('FE-PLANNER-GAPP-006: a place without coordinates has no directions to start', () => {
    const restore = withDevice(IPHONE)
    try {
      expect(getNavigationTargets(place({ lat: null, lng: null, google_place_id: 'ChIJx' })).map(t => t.id)).not.toContain('google-app')
      expect(getGoogleMapsAppUrlForPlace(null)).toBeNull()
    } finally { restore() }
  })
})

describe('openMapsFallback', () => {
  const pair = { native: 'comgooglemaps://?daddr=1,2', https: 'https://www.google.com/maps?q=1,2&z=15' }

  /** A document and window that only know events, so every handover signal can be fired by hand. */
  function setup() {
    const view = new EventTarget()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', defaultView: view })
    const assigned: string[] = []
    const location = { set href(v: string) { assigned.push(v) } }
    const open = vi.fn()
    vi.useFakeTimers()
    openMapsFallback(pair, 1500, open as unknown as typeof window.open, location as unknown as Location, doc as unknown as Document)
    return { view, doc, assigned, open }
  }

  it('FE-PLANNER-GAPP-007: hands over to the app, then opens the web map in a new tab if the page stayed in front', () => {
    const { assigned, open } = setup()
    expect(assigned).toEqual([pair.native])
    expect(open).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(open).toHaveBeenCalledWith(pair.https, '_blank', 'noopener,noreferrer')
  })

  it('FE-PLANNER-GAPP-008: no web map when the page was hidden by the app', () => {
    const { doc, open } = setup()
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5000)
    expect(open).not.toHaveBeenCalled()
  })

  it('FE-PLANNER-GAPP-009: nor when the page was put away, but losing focus alone is no handover', () => {
    const away = setup()
    away.view.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(5000)
    expect(away.open).not.toHaveBeenCalled()
    vi.useRealTimers()

    // Safari's "cannot open page" alert takes the focus when the app is missing.
    const alerted = setup()
    alerted.view.dispatchEvent(new Event('blur'))
    vi.advanceTimersByTime(1500)
    expect(alerted.open).toHaveBeenCalledWith(pair.https, '_blank', 'noopener,noreferrer')
  })

  it('FE-PLANNER-GAPP-010: a page that only blinked visible again still counts as handed over', () => {
    const { doc, open } = setup()
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5000)
    expect(open).not.toHaveBeenCalled()
  })

  it('FE-PLANNER-GAPP-011: openNavigationTarget routes a native-scheme target through the fallback', () => {
    vi.useFakeTimers()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    // jsdom cannot navigate to a custom scheme; only the assignment is of interest here.
    const hrefSet = vi.fn()
    const realLocation = window.location
    Object.defineProperty(window, 'location', { value: { set href(v: string) { hrefSet(v) } }, configurable: true })
    try {
      openNavigationTarget({ id: 'google-app', label: 'Google Maps app', url: pair.native, fallbackUrl: pair.https })
      expect(hrefSet).toHaveBeenCalledWith(pair.native)
      vi.advanceTimersByTime(1500)
      expect(open).toHaveBeenCalledWith(pair.https, '_blank', 'noopener,noreferrer')
    } finally {
      Object.defineProperty(window, 'location', { value: realLocation, configurable: true })
    }
  })
})
