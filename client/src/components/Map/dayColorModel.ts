import { isServiceStopType } from '../Roadtrip/roadtripModel'
import type { Accommodation, AssignmentsMap, Day } from '../../types'
import type { DayInfo, PlaceDayMap } from './dayColorMarkers'

/**
 * Fork-only: which day every stop belongs to and the number it wears there — the one
 * reading of a trip that the day-colour mode's maps and plan lists all draw from.
 * Pure, so the shells cannot each count differently.
 */

/** Zero-based position of every day in day_number order: the index of its palette colour. */
export function dayIndexById(days: Day[]): Map<number, number> {
  const sorted = [...days].sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))
  return new Map(sorted.map((day, i) => [day.id, i]))
}

export interface DayColorIndex {
  /** Every day each place is on, numbered, or as a stay with number 0 — for the map pins. */
  placeDayMap: PlaceDayMap
  /** The day of each visit and the number it wears in that day's list — for the plan lists. */
  stopByAssignment: Map<number, DayInfo>
}

/**
 * Number each day's stops the way the map numbers the selected day (`dayOrderMap`):
 * in planned order, passing over service stops, which the map draws without a badge
 * and the rail gives no number. A booked night adds its place to every day it covers,
 * unnumbered, so the stay can be drawn in the colours of all of them.
 */
export function buildDayColorIndex(
  days: Day[],
  assignments: AssignmentsMap,
  accommodations: Accommodation[],
  indexById: Map<number, number> = dayIndexById(days),
): DayColorIndex {
  const placeDayMap: PlaceDayMap = {}
  const stopByAssignment = new Map<number, DayInfo>()
  const add = (placeId: number, dayIndex: number, orderNumber: number) => {
    const key = String(placeId)
    if (!placeDayMap[key]) placeDayMap[key] = []
    placeDayMap[key].push({ dayIndex, orderNumber })
  }

  for (const day of days) {
    const dayIndex = indexById.get(day.id)
    if (dayIndex == null) continue
    const visits = [...(assignments[String(day.id)] || [])].sort((a, b) => a.order_index - b.order_index)
    let counted = 0
    for (const visit of visits) {
      if (!visit.place?.id || isServiceStopType(visit.place.stop_type)) continue
      counted += 1
      stopByAssignment.set(visit.id, { dayIndex, orderNumber: counted })
      add(visit.place.id, dayIndex, counted)
    }
  }

  for (const stay of accommodations) {
    if (!stay.place_id) continue
    const start = indexById.get(stay.start_day_id)
    const end = indexById.get(stay.end_day_id)
    if (start == null || end == null) continue
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      if (!placeDayMap[String(stay.place_id)]?.some(entry => entry.dayIndex === i)) add(stay.place_id, i, 0)
    }
  }

  // Earliest day first: with no day picked, a pin wears the first day it is on.
  for (const list of Object.values(placeDayMap)) list.sort((a, b) => a.dayIndex - b.dayIndex)
  return { placeDayMap, stopByAssignment }
}
