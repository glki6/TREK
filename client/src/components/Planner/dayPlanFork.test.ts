import { describe, expect, it } from 'vitest';
import { buildAssignment, buildDay, buildPlace } from '../../../tests/helpers/factories';
import type { Accommodation } from '../../types';
import type { MergedItem } from '../../utils/dayMerge';
import { dayExportStopsOf, type DayExportContext } from './dayPlanFork';

// FE-PLANNER-DAYPLANFORK-001 to 004 (fork-only module): one day's export stops, read the
// way DayPlanSidebar holds the day, for the day's own hand-offs and the whole-trip export.

const day = buildDay({ id: 10, day_number: 1, date: '2025-06-01' });
const nextDay = buildDay({ id: 11, day_number: 2, date: '2025-06-02' });
const louvre = buildPlace({ id: 101, name: 'Louvre', lat: 48.8606, lng: 2.3376 });
// Checked into on the day, with no check-in time: whether the day starts there depends on
// how the traveller arrived (#2157).
const hotel = {
  id: 1,
  start_day_id: 10,
  end_day_id: 11,
  check_in: null,
  place_lat: 48.85,
  place_lng: 2.35,
  place_name: 'Hotel',
} as unknown as Accommodation;

const flight = (endpoints: Array<{ role: 'from' | 'to'; lat: number | null; lng: number | null }>): MergedItem => ({
  type: 'transport',
  sortKey: 0,
  data: { id: 70, type: 'flight', day_id: 10, end_day_id: 10, endpoints },
});

function ctx(items: MergedItem[] = [], over: Partial<DayExportContext> = {}): DayExportContext {
  return {
    days: [day, nextDay],
    accommodations: [hotel],
    bookends: true,
    assignmentsOf: (id) => (id === 10 ? [buildAssignment({ id: 1, day_id: 10, order_index: 0, place: louvre })] : []),
    itemsOf: (id) => (id === 10 ? items : undefined),
    ...over,
  };
}

const names = (stops: Array<{ name?: string | null }>) => stops.map((s) => s.name);

describe('dayExportStopsOf', () => {
  it('FE-PLANNER-DAYPLANFORK-001: a day reached by road starts at the hotel checked into that day', () => {
    expect(names(dayExportStopsOf(day, ctx()))).toEqual(['Hotel', 'Louvre', 'Hotel']);
    // A hire car or a note is no carrier: it changes nothing.
    const car: MergedItem = { type: 'transport', sortKey: 0, data: { id: 71, type: 'car', day_id: 10 } };
    const note: MergedItem = { type: 'note', sortKey: 1, data: { id: 3 } };
    expect(names(dayExportStopsOf(day, ctx([car, note])))).toEqual(['Hotel', 'Louvre', 'Hotel']);
  });

  it('FE-PLANNER-DAYPLANFORK-002: a located flight that lands on the day drops the morning leg out of the hotel', () => {
    const landed = flight([
      { role: 'from', lat: 51.47, lng: -0.45 },
      { role: 'to', lat: 49.0, lng: 2.55 },
    ]);
    expect(names(dayExportStopsOf(day, ctx([landed])))).toEqual(['Louvre', 'Hotel']);
  });

  it('FE-PLANNER-DAYPLANFORK-003: a flight without coordinates is no proof of travel for the legs', () => {
    const unlocated = flight([
      { role: 'from', lat: null, lng: null },
      { role: 'to', lat: null, lng: null },
    ]);
    expect(names(dayExportStopsOf(day, ctx([unlocated])))).toEqual(['Hotel', 'Louvre', 'Hotel']);
  });

  it('FE-PLANNER-DAYPLANFORK-004: a day with a booking but no stops exports nothing, and without bookends no hotel', () => {
    const none = ctx([flight([])], { assignmentsOf: () => [] });
    expect(dayExportStopsOf(day, none)).toEqual([]);
    expect(names(dayExportStopsOf(day, ctx([], { bookends: false })))).toEqual(['Louvre']);
  });
});
