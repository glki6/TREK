import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMapDisplayStore } from '../../store/mapDisplayStore';
import type { Accommodation, Assignment, AssignmentsMap, Day } from '../../types';
import { getDayColor, getDayRouteColor } from '../../utils/dayColors';
import { summariseTripRoute, type TripOverviewDay } from './tripRouteGeometry';
import { useDayColors } from './useDayColors';
import type { TripRouteOverview } from './useTripRouteOverview';

// FE-MAP-USEDAYCOLORS-001 to FE-MAP-USEDAYCOLORS-008 (fork-only module)

const days = [
  { id: 10, day_number: 1 },
  { id: 20, day_number: 2 },
] as Day[];
const assignments: AssignmentsMap = {
  10: [{ id: 1, order_index: 0, place: { id: 100, stop_type: null } }] as unknown as Assignment[],
  20: [{ id: 2, order_index: 0, place: { id: 200, stop_type: null } }] as unknown as Assignment[],
};
const accommodations = [{ place_id: 900, start_day_id: 10, end_day_id: 20 }] as Accommodation[];
const line: [number, number][] = [
  [48, 2],
  [48.1, 2.1],
];
const UPSTREAM = { line: '#0a84ff', casing: '#0a5cc2' };
const overviewDay = (dayId: number, lines: number) =>
  ({
    dayId,
    color: UPSTREAM,
    lines: Array.from({ length: lines }, () => line),
    segments: [],
    distance: 0,
    duration: 0,
  }) as unknown as TripOverviewDay;
const overviewOf = (overviewDays: TripOverviewDay[]): TripRouteOverview => ({
  ...summariseTripRoute(overviewDays),
  loading: false,
});

type Opts = Parameters<typeof useDayColors>[0];
const base: Opts = {
  days,
  assignments,
  accommodations,
  selectedDayId: 20,
  overview: overviewOf([]),
  route: [line, line],
};
const render = (over: Partial<Opts> = {}) => renderHook(() => useDayColors({ ...base, ...over })).result;

beforeEach(() => {
  localStorage.clear();
  useMapDisplayStore.setState({ dayColors: false, noCluster: false });
});

describe('useDayColors', () => {
  it('FE-MAP-USEDAYCOLORS-001: switched off, it leaves every colour to upstream', () => {
    const overview = overviewOf([overviewDay(10, 1)]);
    const r = render({ overview });
    expect(r.current.overview).toBe(overview);
    expect(r.current.active).toBe(false);
    expect(r.current.lineColors).toBeUndefined();
    expect(r.current.colorOfDay(10)).toBeNull();
    expect(r.current.stopBadge(1, 10)).toBeNull();
    expect(r.current.mapMode.useDayColors).toBe(false);
  });

  it('FE-MAP-USEDAYCOLORS-002: switched on, days and stops take the palette', () => {
    useMapDisplayStore.setState({ dayColors: true });
    const r = render();
    expect(r.current.colorOfDay(20)).toBe(getDayColor(1));
    expect(r.current.stopBadge(2, 20)).toEqual({ color: getDayColor(1), number: 1 });
    expect(r.current.stopBadge(2, 10)).toBeNull(); // that visit is not on day 10
    expect(r.current.mapMode).toMatchObject({ useDayColors: true, selectedDayIndex: 1 });
    expect(r.current.mapMode.accommodationPlaceIds.has(900)).toBe(true);
  });

  it('FE-MAP-USEDAYCOLORS-003: an open day panel picks the colour of a pin that is on several days', () => {
    useMapDisplayStore.setState({ dayColors: true });
    expect(render({ detailDayId: 10 }).current.mapMode.selectedDayIndex).toBe(0);
    expect(render({ selectedDayId: null }).current.mapMode.selectedDayIndex).toBeNull();
  });

  it("FE-MAP-USEDAYCOLORS-004: the selected day's route is drawn in that day's colour, every line of it", () => {
    useMapDisplayStore.setState({ dayColors: true });
    expect(render().current.lineColors).toEqual([getDayRouteColor(1), getDayRouteColor(1)]);
    expect(render({ route: null }).current.lineColors).toBeUndefined();
    expect(render({ selectedDayId: null }).current.lineColors).toBeUndefined();
  });

  it('FE-MAP-USEDAYCOLORS-005: the whole-trip overview takes the palette, its legend and its lines alike', () => {
    useMapDisplayStore.setState({ dayColors: true });
    const r = render({ overview: overviewOf([overviewDay(10, 2), overviewDay(20, 1), overviewDay(77, 1)]) });
    expect(r.current.overview.days.map((d) => d.color)).toEqual([getDayRouteColor(0), getDayRouteColor(1), UPSTREAM]);
    expect(r.current.overview.lineColors).toEqual([
      getDayRouteColor(0),
      getDayRouteColor(0),
      getDayRouteColor(1),
      UPSTREAM, // a day the trip no longer has keeps upstream's colour
    ]);
    expect(r.current.overview.lines).toHaveLength(4);
  });

  it('FE-MAP-USEDAYCOLORS-006: road trip mode paints its own days, so the fork stands down entirely', () => {
    useMapDisplayStore.setState({ dayColors: true, noCluster: true });
    const overview = overviewOf([overviewDay(10, 1)]);
    const r = render({ suppressed: true, overview });
    expect(r.current.active).toBe(false);
    expect(r.current.lineColors).toBeUndefined();
    expect(r.current.overview).toBe(overview);
    expect(r.current.mapMode).toMatchObject({ useDayColors: false, disableClustering: false });
  });

  it('FE-MAP-USEDAYCOLORS-007: the clustering switch works whether day colours are on or not', () => {
    useMapDisplayStore.setState({ noCluster: true });
    expect(render().current.mapMode.disableClustering).toBe(true);
  });

  it('FE-MAP-USEDAYCOLORS-008: both switches are kept for the next visit', () => {
    act(() => {
      useMapDisplayStore.getState().toggleDayColors();
    });
    act(() => {
      useMapDisplayStore.getState().toggleClustering();
    });
    expect(JSON.parse(localStorage.getItem('trek.fork.map-display') ?? '{}').state).toEqual({
      dayColors: true,
      noCluster: true,
    });
  });
});
