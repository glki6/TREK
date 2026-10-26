import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DayClusterGroup, dayMarkerKey, useDayIcon } from './dayColorLeaflet';
import { dayColorMapMode, type DayColorMapData } from './dayColorMarkers';

// FE-MAP-DAYCOLOR-LEAFLET-001 to 004 (fork-only module): the Leaflet side of the day-colour map mode.

vi.mock('react-leaflet-cluster', () => ({
  default: ({ children, chunkedLoading }: { children: ReactNode; chunkedLoading?: boolean }) => (
    <div data-testid="cluster-group" data-chunked={String(chunkedLoading)}>
      {children}
    </div>
  ),
}));

const mode = (over: Partial<DayColorMapData> = {}) =>
  dayColorMapMode({
    useDayColors: true,
    disableClustering: false,
    placeDayMap: { 7: [{ dayIndex: 1, orderNumber: 3 }] },
    selectedDayIndex: null,
    accommodationPlaceIds: new Set<number>(),
    ...over,
  });

describe('dayMarkerKey', () => {
  it("FE-MAP-DAYCOLOR-LEAFLET-001: is the place's day marker as a string, or null for upstream's", () => {
    expect(dayMarkerKey(mode(), 7)).toBe(JSON.stringify({ kind: 'numbered', dayIndex: 1, orderNumber: 3 }));
    expect(dayMarkerKey(mode(), 8)).toBeNull();
    expect(dayMarkerKey(mode({ useDayColors: false }), 7)).toBeNull();
    expect(dayMarkerKey(null, 7)).toBeNull();
    expect(dayMarkerKey(undefined, 7)).toBeNull();
  });
});

describe('useDayIcon', () => {
  it('FE-MAP-DAYCOLOR-LEAFLET-002: builds the marker icon once per marker and selection', () => {
    const key = dayMarkerKey(mode(), 7);
    const { result, rerender } = renderHook(({ k, selected }) => useDayIcon(k, selected), {
      initialProps: { k: key, selected: false },
    });
    const icon = result.current;
    expect(icon?.options.iconSize).toEqual([36, 36]);
    expect(icon?.options.iconAnchor).toEqual([18, 18]);
    expect(String(icon?.options.html)).toContain('#7045af'); // day 2 of the palette
    expect(String(icon?.options.html)).toContain('box-sizing:border-box');

    rerender({ k: key, selected: false });
    expect(result.current).toBe(icon);
    rerender({ k: key, selected: true });
    expect(result.current?.options.iconSize).toEqual([44, 44]);
    rerender({ k: null, selected: true });
    expect(result.current).toBeNull();
  });
});

describe('DayClusterGroup', () => {
  it("FE-MAP-DAYCOLOR-LEAFLET-003: is upstream's cluster group, its options passed on, while clustering is on", () => {
    render(
      <DayClusterGroup mode={mode()} chunkedLoading>
        <span data-testid="pin" />
      </DayClusterGroup>
    );
    expect(screen.getByTestId('cluster-group')).toHaveAttribute('data-chunked', 'true');
    expect(screen.getByTestId('cluster-group')).toContainElement(screen.getByTestId('pin'));

    render(
      <DayClusterGroup mode={null}>
        <span data-testid="lone-pin" />
      </DayClusterGroup>
    );
    expect(screen.getAllByTestId('cluster-group')[1]).toContainElement(screen.getByTestId('lone-pin'));
  });

  it('FE-MAP-DAYCOLOR-LEAFLET-004: with clustering off, the markers are drawn bare, one by one', () => {
    render(
      <DayClusterGroup mode={mode({ useDayColors: false, disableClustering: true })} chunkedLoading>
        <span data-testid="pin" />
      </DayClusterGroup>
    );
    expect(screen.getByTestId('pin')).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-group')).toBeNull();
  });
});
