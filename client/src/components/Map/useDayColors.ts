import { useCallback, useMemo } from 'react';
import { useMapDisplayStore } from '../../store/mapDisplayStore';
import type { Accommodation, AssignmentsMap, Day } from '../../types';
import { getDayColor, getDayRouteColor } from '../../utils/dayColors';
import { dayColorMapMode, type DayColorMapMode } from './dayColorMarkers';
import { buildDayColorIndex, dayIndexById } from './dayColorModel';
import type { TripRouteOverview } from './useTripRouteOverview';

/**
 * Fork-only: the day-colour map mode's model. Its switches and badge live in
 * dayColorMode.tsx.
 *
 * `useDayColors` runs once, inside useTripPlanner, so the desktop planner and the
 * phone shell read one model: the map's mode, the colours of the drawn route, and the
 * colour and number of every day and stop in the plan lists. PlanMapStage and MMapArea
 * only hand it to the map; DayPlanSidebar and the phone's plan rows only ask it.
 */

type RouteColor = { line: string; casing: string };

/** A stop's badge in a plan list: its day's colour and its number on that day. */
export interface DayStopBadgeSpec {
  color: string;
  number: number;
}

export interface DayColors {
  /** Day colours are switched on and nothing outranks them. */
  active: boolean;
  /** The map's `dayColorMode` (<MapViewAuto>): day-coloured pins and the clustering switch. */
  mapMode: DayColorMapMode;
  /** The whole-trip overview with every day in the palette while day colours are on — lines and legend alike. */
  overview: TripRouteOverview;
  /** The selected day's route in that day's colour while day colours are on; undefined leaves upstream's. */
  lineColors: RouteColor[] | undefined;
  /** The colour of a day, or null while day colours are off. */
  colorOfDay: (dayId: number) => string | null;
  /** The coloured number a visit wears in its day's list, or null. */
  stopBadge: (assignmentId: number, dayId: number) => DayStopBadgeSpec | null;
}

export function useDayColors({
  days,
  assignments,
  accommodations,
  selectedDayId,
  detailDayId = null,
  suppressed = false,
  overview,
  route,
}: {
  days: Day[];
  assignments: AssignmentsMap;
  accommodations: Accommodation[];
  selectedDayId: number | null;
  /** The day whose detail panel is open; it picks the colour of a pin that is on several days. */
  detailDayId?: number | null;
  /** Desktop road trip mode paints the days in its own palette, so this one stands down. */
  suppressed?: boolean;
  /** The whole-trip overview as upstream draws it. */
  overview: TripRouteOverview;
  /** The selected day's route, one entry per drawn line. */
  route: readonly unknown[] | null;
}): DayColors {
  const dayColorsOn = useMapDisplayStore((s) => s.dayColors);
  const noCluster = useMapDisplayStore((s) => s.noCluster);
  const active = dayColorsOn && !suppressed;

  const indexById = useMemo(() => dayIndexById(days), [days]);
  const { placeDayMap, stopByAssignment } = useMemo(
    () => buildDayColorIndex(days, assignments, accommodations, indexById),
    [days, assignments, accommodations, indexById]
  );
  const accommodationPlaceIds = useMemo(
    () => new Set(accommodations.flatMap((stay) => (stay.place_id ? [stay.place_id] : []))),
    [accommodations]
  );
  const focusDayId = detailDayId ?? selectedDayId;
  const selectedDayIndex = focusDayId != null ? (indexById.get(focusDayId) ?? null) : null;
  const routeDayIndex = selectedDayId != null ? (indexById.get(selectedDayId) ?? null) : null;

  // Recoloured where upstream colours it, so the panel's legend and the map's lines agree:
  // each day takes its palette colour, and the lines follow their day (summariseTripRoute).
  const recoloredOverview = useMemo<TripRouteOverview>(() => {
    if (!active) return overview;
    const tripDays = overview.days.map((day) => {
      const index = indexById.get(day.dayId);
      return index == null ? day : { ...day, color: getDayRouteColor(index) };
    });
    return { ...overview, days: tripDays, lineColors: tripDays.flatMap((day) => day.lines.map(() => day.color)) };
  }, [active, overview, indexById]);

  const lineColors = useMemo<RouteColor[] | undefined>(() => {
    if (!active || !route?.length || routeDayIndex == null) return undefined;
    const color = getDayRouteColor(routeDayIndex);
    return route.map(() => color);
  }, [active, route, routeDayIndex]);

  const mapMode = useMemo(
    () =>
      dayColorMapMode({
        useDayColors: active,
        disableClustering: noCluster && !suppressed,
        placeDayMap,
        selectedDayIndex,
        accommodationPlaceIds,
      }),
    [active, noCluster, suppressed, placeDayMap, selectedDayIndex, accommodationPlaceIds]
  );

  const colorOfDay = useCallback(
    (dayId: number) => {
      const index = indexById.get(dayId);
      return active && index != null ? getDayColor(index) : null;
    },
    [active, indexById]
  );

  const stopBadge = useCallback(
    (assignmentId: number, dayId: number) => {
      const stop = stopByAssignment.get(assignmentId);
      // Only on the visit's own day: mid-move, a row can briefly render under another.
      if (!active || !stop || stop.dayIndex !== indexById.get(dayId)) return null;
      return { color: getDayColor(stop.dayIndex), number: stop.orderNumber };
    },
    [active, indexById, stopByAssignment]
  );

  return useMemo(
    () => ({ active, mapMode, overview: recoloredOverview, lineColors, colorOfDay, stopBadge }),
    [active, mapMode, recoloredOverview, lineColors, colorOfDay, stopBadge]
  );
}
