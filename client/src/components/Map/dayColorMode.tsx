import { useMemo, useSyncExternalStore } from 'react'
import { Palette, Grid3x3 } from 'lucide-react'
import { Tooltip } from '../shared/Tooltip'
import { MAP_CONTROL_SHADOW } from './mapControlShadow'
import type { PlaceDayMap } from './dayColorMarkers'
import type { Accommodation, Day } from '../../types'

/**
 * Fork-only: the "day colours" and "no clustering" map toggles.
 *
 * One module so the desktop planner page and the phone map share a single source of
 * truth, and so TripPlannerPage / MMapArea only need a couple of lines each. Persisted
 * in localStorage (per browser) so the choice survives a reload.
 */

const STORAGE_KEY = 'trek:fork:map-display'

interface MapDisplayPrefs {
  /** Colour markers (and numbered stops) by the day they belong to. */
  dayColors: boolean
  /** Show every marker individually instead of grouping them into cluster bubbles. */
  noCluster: boolean
}

const DEFAULTS: MapDisplayPrefs = { dayColors: false, noCluster: false }

function load(): MapDisplayPrefs {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<MapDisplayPrefs>
    return { dayColors: parsed.dayColors === true, noCluster: parsed.noCluster === true }
  } catch {
    return DEFAULTS
  }
}

let current: MapDisplayPrefs = load()
const listeners = new Set<() => void>()

function update(patch: Partial<MapDisplayPrefs>): void {
  current = { ...current, ...patch }
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)) } catch { /* storage unavailable: keep it in memory */ }
  listeners.forEach(fn => { try { fn() } catch { /* isolate listeners */ } })
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const getSnapshot = () => current

export function useMapDisplayPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    useDayColors: prefs.dayColors,
    disableClustering: prefs.noCluster,
    toggleDayColors: () => update({ dayColors: !current.dayColors }),
    toggleClustering: () => update({ noCluster: !current.noCluster }),
  }
}

/**
 * Everything the maps need for day-coloured markers, ready to spread onto <MapView>.
 *
 * `selectedDayIndex` is the zero-based index of the day being looked at (the day
 * detail panel wins over the selected day), which picks that day's colour and number
 * for places that appear on several days.
 */
export function useDayColorMapProps(opts: {
  days: Day[]
  selectedDayId?: number | null
  detailDayId?: number | null
  accommodations: Accommodation[]
  placeDayMap: PlaceDayMap
}) {
  const { days, selectedDayId, detailDayId, accommodations, placeDayMap } = opts
  const { useDayColors, disableClustering } = useMapDisplayPrefs()

  const selectedDayIndex = useMemo(() => {
    const targetId = detailDayId ?? selectedDayId
    if (!targetId) return null
    const idx = days.findIndex(d => d.id === targetId)
    return idx >= 0 ? idx : null
  }, [days, detailDayId, selectedDayId])

  const accommodationPlaceIds = useMemo(() => {
    const ids = new Set<number>()
    for (const acc of accommodations) if (acc.place_id) ids.add(acc.place_id)
    return ids
  }, [accommodations])

  return { useDayColors, disableClustering, placeDayMap, selectedDayIndex, accommodationPlaceIds }
}

/** Same frosted shell as the other map pills (see TripRouteOverviewPill). */
function MapTogglePill({ active, onToggle, label, testId, children }: {
  active: boolean
  onToggle: () => void
  label: string
  testId: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', padding: 4, borderRadius: 999, pointerEvents: 'auto',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      boxShadow: MAP_CONTROL_SHADOW,
    }}>
      <Tooltip label={label} placement="left">
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-pressed={active}
          data-testid={testId}
          className={active ? 'text-accent' : 'text-content-muted'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'transparent', padding: 0,
            transition: 'background 0.14s, color 0.14s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {children}
        </button>
      </Tooltip>
    </div>
  )
}

/** Both toggles, stacked the way the other pills in the bottom-right cluster are. */
export function DayColorPills() {
  const { useDayColors, disableClustering, toggleDayColors, toggleClustering } = useMapDisplayPrefs()
  return (
    <>
      <MapTogglePill
        active={useDayColors}
        onToggle={toggleDayColors}
        label={useDayColors ? 'Disable day colors' : 'Enable day colors'}
        testId="day-colors-pill"
      >
        <Palette size={17} strokeWidth={2} />
      </MapTogglePill>
      <MapTogglePill
        active={disableClustering}
        onToggle={toggleClustering}
        label={disableClustering ? 'Re-enable marker clustering' : 'Disable marker clustering'}
        testId="no-cluster-pill"
      >
        <Grid3x3 size={17} strokeWidth={2} />
      </MapTogglePill>
    </>
  )
}
