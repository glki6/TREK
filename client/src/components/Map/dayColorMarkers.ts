import { createElement } from 'react';
import { getDayColor } from '../../utils/dayColors';
import { renderIconMarkup } from '../../utils/iconMarkup';
import { CATEGORY_ICON_MAP } from '../shared/categoryIcons';

/**
 * Fork-only: day-coloured map markers, shared by the Leaflet and GL renderers.
 *
 *   numbered   solid day-coloured circle with the stop's sequence number
 *   stay       day-coloured circle with a home icon (an accommodation)
 *   stay-multi pie chart with one equal wedge per day, home icon centred (a stay
 *              spanning several days)
 *
 * Kept out of MapView.tsx / MapViewGL.tsx so those files can track upstream. The planner
 * hands both renderers one `dayColorMode` (mapViewContract.ts, built by `dayColorMapMode`
 * below): the GL renderer calls its methods, the Leaflet one goes through
 * dayColorLeaflet.tsx, so neither file imports anything of the fork's.
 */

export type DayInfo = { dayIndex: number; orderNumber: number };
export type PlaceDayMap = Record<string, DayInfo[]>;

export type DayMarkerSpec =
  | { kind: 'numbered'; dayIndex: number; orderNumber: number }
  | { kind: 'stay'; dayIndex: number }
  | { kind: 'stay-multi'; dayIndices: number[] };

/**
 * Decide which day-coloured marker a place gets, or null to use the normal one.
 *
 * `placeDayMap` holds every day a place appears on. When a day is selected its
 * entry wins, otherwise the earliest one does.
 */
export function resolveDayMarker(opts: {
  useDayColors: boolean;
  placeId: number;
  placeDayMap?: PlaceDayMap | null;
  selectedDayIndex?: number | null;
  accommodationPlaceIds?: Set<number> | null;
}): DayMarkerSpec | null {
  const { useDayColors, placeId, placeDayMap, selectedDayIndex = null, accommodationPlaceIds } = opts;
  if (!useDayColors) return null;
  const raw = placeDayMap?.[String(placeId)];
  if (!raw || raw.length === 0) return null;

  const info = selectedDayIndex !== null ? (raw.find((a) => a.dayIndex === selectedDayIndex) ?? raw[0]) : raw[0];
  if (!info) return null;

  if (accommodationPlaceIds?.has(placeId)) {
    const dayIndices = Array.from(new Set(raw.map((a) => a.dayIndex))).sort((a, b) => a - b);
    if (dayIndices.length >= 2) return { kind: 'stay-multi', dayIndices };
    return { kind: 'stay', dayIndex: info.dayIndex };
  }
  return { kind: 'numbered', dayIndex: info.dayIndex, orderNumber: info.orderNumber };
}

/** Diameter of the marker's circle. */
export const dayMarkerSize = (selected: boolean) => (selected ? 44 : 36);
const sizeOf = dayMarkerSize;
const borderOf = (selected: boolean) => (selected ? 3 : 2.5);
const shadowOf = (selected: boolean) =>
  selected ? '0 0 0 3px rgba(17,24,39,0.25), 0 4px 14px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.22)';

/** Outer pixel box of the marker (size plus its white border). */
export function dayMarkerBox(spec: DayMarkerSpec, selected: boolean): number {
  return spec.kind === 'stay-multi' ? sizeOf(selected) : sizeOf(selected) + borderOf(selected) * 2;
}

function homeSvg(selected: boolean, filled: boolean): string {
  const Home = CATEGORY_ICON_MAP['Home'];
  if (!Home) return '';
  return renderIconMarkup(
    createElement(Home, {
      size: selected ? 22 : 18,
      color: 'white',
      strokeWidth: 2.5,
      ...(filled ? { fill: 'white', fillOpacity: 0.3 } : {}),
    })
  );
}

/** SVG pie-wedge path from (cx,cy), clockwise from 12 o'clock. Angles in radians. */
function svgArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startX = cx + r * Math.cos(startAngle);
  const startY = cy + r * Math.sin(startAngle);
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}

function pieHtml(dayIndices: number[], selected: boolean): string {
  const size = sizeOf(selected);
  const r = size / 2 - 1.5; // leave room for the outer ring
  const c = size / 2;
  const ringSw = borderOf(selected);
  const wedgeAngle = (2 * Math.PI) / dayIndices.length;
  let wedges = '';
  dayIndices.forEach((day, i) => {
    const start = i * wedgeAngle - Math.PI / 2;
    const end = (i + 1) * wedgeAngle - Math.PI / 2;
    wedges += `<path d="${svgArcPath(c, c, r, start, end)}" fill="${getDayColor(day)}" stroke="#fff" stroke-width="0.5"/>`;
  });
  return (
    `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;box-shadow:${shadowOf(selected)};cursor:pointer;overflow:hidden;">` +
    `<svg style="position:absolute;inset:0;display:block" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${wedges}` +
    `<circle cx="${c}" cy="${c}" r="${r + ringSw / 2}" fill="none" stroke="#fff" stroke-width="${ringSw}"/></svg>` +
    `<div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none">${homeSvg(selected, true)}</div></div>`
  );
}

/**
 * HTML of one marker.
 *
 * `boxSizing` differs per renderer: Leaflet sizes the icon itself (border-box), while
 * GL wraps it in a box that already includes the border (content-box).
 */
export function dayMarkerHtml(spec: DayMarkerSpec, selected: boolean, boxSizing: 'border-box' | 'content-box'): string {
  if (spec.kind === 'stay-multi') return pieHtml(spec.dayIndices, selected);
  const size = sizeOf(selected);
  const base =
    `width:${size}px;height:${size}px;border-radius:50%;background:${getDayColor(spec.dayIndex)};` +
    `border:${borderOf(selected)}px solid white;box-shadow:${shadowOf(selected)};` +
    `display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1;box-sizing:${boxSizing};`;
  if (spec.kind === 'stay') {
    return `<div style="${base}overflow:hidden;">${homeSvg(selected, false)}</div>`;
  }
  return `<div style="${base}font-size:${selected ? 20 : 16}px;font-weight:800;color:white;font-family:var(--font-system);">${spec.orderNumber}</div>`;
}

/** Marker element for the GL renderers (Mapbox GL / MapLibre). */
export function dayMarkerElement(spec: DayMarkerSpec, selected: boolean): HTMLDivElement {
  const box = dayMarkerBox(spec, selected);
  const el = document.createElement('div');
  el.style.cssText = `width:${box}px;height:${box}px;cursor:pointer;display:grid;place-items:center;`;
  el.innerHTML = dayMarkerHtml(spec, selected, 'content-box');
  return el;
}

/** What a day-coloured map takes: one prop of both renderers (mapViewContract.ts). */
export interface DayColorMapMode {
  /** Colour the pins by day; false leaves upstream's pins while the clustering switch still applies. */
  useDayColors: boolean;
  /** Draw every pin on its own instead of grouping nearby ones into cluster bubbles. */
  disableClustering: boolean;
  placeDayMap: PlaceDayMap;
  /** The day whose colour a pin on several days takes; null picks its earliest day. */
  selectedDayIndex: number | null;
  accommodationPlaceIds: Set<number>;
  /** The day-coloured marker of a place, or null for upstream's. */
  markerSpec: (placeId: number) => DayMarkerSpec | null;
  /** The GL renderers' element for that marker, or null for upstream's. */
  markerElement: (placeId: number, selected: boolean) => HTMLDivElement | null;
  /**
   * With clustering off, empties the GL cluster source (its bubbles would stand over the
   * pins with stale counts) and answers true, so every pin is drawn on its own.
   */
  clearClusters: (source: { setData: (data: { type: 'FeatureCollection'; features: never[] }) => unknown }) => boolean;
}

export type DayColorMapData = Pick<
  DayColorMapMode,
  'useDayColors' | 'disableClustering' | 'placeDayMap' | 'selectedDayIndex' | 'accommodationPlaceIds'
>;

export function dayColorMapMode(data: DayColorMapData): DayColorMapMode {
  const markerSpec = (placeId: number) => resolveDayMarker({ ...data, placeId });
  return {
    ...data,
    markerSpec,
    markerElement: (placeId, selected) => {
      const spec = markerSpec(placeId);
      return spec ? dayMarkerElement(spec, selected) : null;
    },
    clearClusters: (source) => {
      if (!data.disableClustering) return false;
      source.setData({ type: 'FeatureCollection', features: [] });
      return true;
    },
  };
}
