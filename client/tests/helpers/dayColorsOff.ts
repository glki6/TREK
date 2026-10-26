import { dayColorMapMode } from '../../src/components/Map/dayColorMarkers';

/**
 * Fork: the day-colour model with day colours switched off, the way useTripPlanner
 * hands it out by default (components/Map/useDayColors.ts). The planner fixtures carry
 * it, so the shells read the fork's props as they do on a real page.
 */
export function dayColorsOff() {
  return {
    active: false,
    mapMode: dayColorMapMode({
      useDayColors: false,
      disableClustering: false,
      placeDayMap: {},
      selectedDayIndex: null,
      accommodationPlaceIds: new Set<number>(),
    }),
    lineColors: undefined,
    colorOfDay: () => null,
    stopBadge: () => null,
  };
}
