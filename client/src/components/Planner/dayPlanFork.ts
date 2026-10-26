import type { Accommodation, Assignment, Day } from '../../types';
import { hasCarrierEndpointOnDay, isCarrierTransport, type MergedItem } from '../../utils/dayMerge';
import type { DayColors } from '../Map/useDayColors';
import { dayExportStops } from './dayRoute';

/**
 * Fork-only: what DayPlanSidebar takes and does for this fork, kept out of that file so
 * it can track upstream. It imports this one module: the day-colour model as a prop,
 * the avatar that shows a stop's day-coloured number, and one day's export stops for
 * both the day's own hand-offs and the toolbar's whole-trip Google Maps export.
 */

export { DayStopAvatar } from '../Map/dayColorMode';

export interface DayPlanForkProps {
  /** The day-colour mode (components/Map/useDayColors.ts): the day tile's colour, the stops' numbers. */
  dayColors?: DayColors;
}

/** What a day's export stops are read from, as DayPlanSidebar holds it. */
export interface DayExportContext {
  days: Day[];
  accommodations: Accommodation[];
  /** The "optimize from accommodation" setting: off, a day's route has no hotel at either end. */
  bookends: boolean;
  assignmentsOf: (dayId: number) => Assignment[];
  itemsOf: (dayId: number) => MergedItem[] | undefined;
}

/**
 * One day's located stops for a map app (dayRoute.ts `dayExportStops`), with the carrier
 * gate the drawn route applies (#2157, #2476): computed one way for the day's own
 * export and for every day of the whole-trip one, so the two never disagree.
 */
export function dayExportStopsOf(day: Day, ctx: DayExportContext): ReturnType<typeof dayExportStops> {
  const carriers = (ctx.itemsOf(day.id) || []).filter((i) => i.type === 'transport' && isCarrierTransport(i.data));
  return dayExportStops(day, ctx.days, ctx.assignmentsOf(day.id), ctx.accommodations, ctx.bookends, {
    located: carriers.some((i) => hasCarrierEndpointOnDay(i.data, day.id)),
    booked: carriers.length > 0,
  });
}
