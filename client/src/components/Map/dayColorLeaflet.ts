import L from 'leaflet';
import { createElement, Fragment, useMemo, type ComponentProps } from 'react';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { dayMarkerHtml, dayMarkerSize, type DayColorMapMode, type DayMarkerSpec } from './dayColorMarkers';

/**
 * Fork-only: the Leaflet side of the day-colour map mode, so MapView.tsx takes the mode
 * with one import and a few words on lines it already had. The GL renderer needs none
 * of this: it calls the mode's own methods (dayColorMarkers.ts).
 */

/**
 * The day-coloured marker of a place as a string, or null for upstream's. A string, so
 * MapView's memoised marker still compares its props by value.
 */
export function dayMarkerKey(mode: DayColorMapMode | null | undefined, placeId: number): string | null {
  const spec = mode?.markerSpec(placeId);
  return spec ? JSON.stringify(spec) : null;
}

/** The marker's icon, built once per marker and selection: a fresh divIcon makes react-leaflet swap the DOM. */
export function useDayIcon(key: string | null, selected: boolean): L.DivIcon | null {
  return useMemo(() => {
    if (!key) return null;
    const spec = JSON.parse(key) as DayMarkerSpec;
    const size = dayMarkerSize(selected);
    return L.divIcon({
      className: '',
      html: dayMarkerHtml(spec, selected, 'border-box'),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      tooltipAnchor: [size / 2 + 6, 0],
    });
  }, [key, selected]);
}

type ClusterGroupProps = ComponentProps<typeof MarkerClusterGroup> & { mode?: DayColorMapMode | null };

/** Upstream's cluster group, or the bare markers while the clustering switch is off. */
export function DayClusterGroup({ mode, children, ...props }: ClusterGroupProps) {
  if (mode?.disableClustering) return createElement(Fragment, null, children);
  return createElement(MarkerClusterGroup, props, children);
}
