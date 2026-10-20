import { describe, expect, it } from 'vitest'
import { buildDayColorIndex, dayIndexById } from './dayColorModel'
import type { Accommodation, Assignment, AssignmentsMap, Day } from '../../types'

// FE-MAP-DAYMODEL-001 to FE-MAP-DAYMODEL-007 (fork-only module)

const day = (id: number, day_number: number) => ({ id, day_number }) as Day
const visit = (id: number, placeId: number, order_index: number, stop_type: string | null = null) =>
  ({ id, order_index, place: { id: placeId, stop_type } }) as unknown as Assignment
const stay = (place_id: number, start_day_id: number, end_day_id: number) => ({ place_id, start_day_id, end_day_id }) as Accommodation

const days = [day(10, 1), day(20, 2), day(30, 3)]

describe('dayIndexById', () => {
  it('FE-MAP-DAYMODEL-001: a day\'s colour index follows its day_number, not the order the days arrive in', () => {
    const index = dayIndexById([day(30, 3), day(10, 1), day(20, 2)])
    expect([index.get(10), index.get(20), index.get(30)]).toEqual([0, 1, 2])
  })
})

describe('buildDayColorIndex', () => {
  it('FE-MAP-DAYMODEL-002: numbers each day\'s stops in planned order, starting again every day', () => {
    const assignments: AssignmentsMap = { 10: [visit(2, 200, 1), visit(1, 100, 0)], 20: [visit(3, 300, 0)] }
    const { stopByAssignment, placeDayMap } = buildDayColorIndex(days, assignments, [])
    expect([1, 2, 3].map(id => stopByAssignment.get(id))).toEqual([{ dayIndex: 0, orderNumber: 1 }, { dayIndex: 0, orderNumber: 2 }, { dayIndex: 1, orderNumber: 1 }])
    expect(placeDayMap['200']).toEqual([{ dayIndex: 0, orderNumber: 2 }])
    expect(placeDayMap['300']).toEqual([{ dayIndex: 1, orderNumber: 1 }])
  })

  it('FE-MAP-DAYMODEL-003: a service stop gets no number and uses none up, as on the map and the rail', () => {
    const assignments: AssignmentsMap = { 10: [visit(1, 100, 0), visit(2, 200, 1, 'fuel'), visit(3, 300, 2)] }
    const { stopByAssignment, placeDayMap } = buildDayColorIndex(days, assignments, [])
    expect(stopByAssignment.get(2)).toBeUndefined()
    expect(stopByAssignment.get(3)?.orderNumber).toBe(2)
    expect(placeDayMap['200']).toBeUndefined()
  })

  it('FE-MAP-DAYMODEL-004: a place visited twice in a day keeps both numbers, one per visit', () => {
    const assignments: AssignmentsMap = { 10: [visit(1, 100, 0), visit(2, 200, 1), visit(3, 100, 2)] }
    const { stopByAssignment, placeDayMap } = buildDayColorIndex(days, assignments, [])
    expect([1, 3].map(id => stopByAssignment.get(id)?.orderNumber)).toEqual([1, 3])
    expect(placeDayMap['100']).toEqual([{ dayIndex: 0, orderNumber: 1 }, { dayIndex: 0, orderNumber: 3 }])
  })

  it('FE-MAP-DAYMODEL-005: a booked night adds its place to every day it covers, unnumbered, earliest day first', () => {
    const assignments: AssignmentsMap = { 30: [visit(1, 500, 0)] }
    const { placeDayMap } = buildDayColorIndex(days, assignments, [stay(500, 10, 30)])
    expect(placeDayMap['500']).toEqual([
      { dayIndex: 0, orderNumber: 0 },
      { dayIndex: 1, orderNumber: 0 },
      { dayIndex: 2, orderNumber: 1 },
    ])
  })

  it('FE-MAP-DAYMODEL-006: a stay that runs backwards or off the trip is read safely', () => {
    expect(buildDayColorIndex(days, {}, [stay(500, 30, 20)]).placeDayMap['500'].map(e => e.dayIndex)).toEqual([1, 2])
    expect(buildDayColorIndex(days, {}, [stay(600, 10, 99)]).placeDayMap['600']).toBeUndefined()
    expect(buildDayColorIndex(days, {}, [{ ...stay(0, 10, 20), place_id: null } as unknown as Accommodation]).placeDayMap).toEqual({})
  })

  it('FE-MAP-DAYMODEL-007: a visit without a place is skipped, and a day the index does not know is ignored', () => {
    const assignments: AssignmentsMap = { 10: [{ id: 9, order_index: 0, place: null } as unknown as Assignment, visit(1, 100, 1)], 99: [visit(2, 200, 0)] }
    const { stopByAssignment } = buildDayColorIndex([...days, day(99, 9)], assignments, [], dayIndexById(days))
    expect(stopByAssignment.get(1)?.orderNumber).toBe(1)
    expect(stopByAssignment.has(2)).toBe(false)
  })
})
