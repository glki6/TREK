import { describe, expect, it, vi } from 'vitest';
import { getDayColor } from '../../utils/dayColors';
import {
  dayColorMapMode,
  dayMarkerBox,
  dayMarkerElement,
  dayMarkerHtml,
  resolveDayMarker,
  type PlaceDayMap,
} from './dayColorMarkers';

// FE-MAP-DAYCOLOR-001 to FE-MAP-DAYCOLOR-016 (fork-only module)

const map: PlaceDayMap = {
  '1': [
    { dayIndex: 0, orderNumber: 2 },
    { dayIndex: 2, orderNumber: 1 },
  ], // a stop used on two days
  '2': [
    { dayIndex: 0, orderNumber: 0 },
    { dayIndex: 1, orderNumber: 0 },
    { dayIndex: 2, orderNumber: 0 },
  ], // a 3-night stay
  '3': [{ dayIndex: 1, orderNumber: 0 }], // a 1-night stay
};
const stays = new Set([2, 3]);

describe('resolveDayMarker', () => {
  it('FE-MAP-DAYCOLOR-001: is off unless day colours are on', () => {
    expect(resolveDayMarker({ useDayColors: false, placeId: 1, placeDayMap: map })).toBeNull();
  });

  it('FE-MAP-DAYCOLOR-002: a place that is on no day keeps its normal marker', () => {
    expect(resolveDayMarker({ useDayColors: true, placeId: 99, placeDayMap: map })).toBeNull();
    expect(resolveDayMarker({ useDayColors: true, placeId: 1, placeDayMap: null })).toBeNull();
  });

  it('FE-MAP-DAYCOLOR-003: with no day selected a stop shows its earliest day', () => {
    expect(resolveDayMarker({ useDayColors: true, placeId: 1, placeDayMap: map })).toEqual({
      kind: 'numbered',
      dayIndex: 0,
      orderNumber: 2,
    });
  });

  it("FE-MAP-DAYCOLOR-004: with a day selected, that day's colour and number win", () => {
    expect(resolveDayMarker({ useDayColors: true, placeId: 1, placeDayMap: map, selectedDayIndex: 2 })).toEqual({
      kind: 'numbered',
      dayIndex: 2,
      orderNumber: 1,
    });
  });

  it('FE-MAP-DAYCOLOR-005: a selected day the place is not on falls back to its earliest day', () => {
    expect(resolveDayMarker({ useDayColors: true, placeId: 1, placeDayMap: map, selectedDayIndex: 1 })).toEqual({
      kind: 'numbered',
      dayIndex: 0,
      orderNumber: 2,
    });
  });

  it('FE-MAP-DAYCOLOR-006: a stay spanning several days becomes a pie with one wedge per distinct day', () => {
    expect(
      resolveDayMarker({ useDayColors: true, placeId: 2, placeDayMap: map, accommodationPlaceIds: stays })
    ).toEqual({ kind: 'stay-multi', dayIndices: [0, 1, 2] });
  });

  it('FE-MAP-DAYCOLOR-007: a one-night stay is a plain coloured home marker, not a pie', () => {
    expect(
      resolveDayMarker({ useDayColors: true, placeId: 3, placeDayMap: map, accommodationPlaceIds: stays })
    ).toEqual({ kind: 'stay', dayIndex: 1 });
  });

  it('FE-MAP-DAYCOLOR-008: a place is only a stay when it is in accommodationPlaceIds', () => {
    expect(
      resolveDayMarker({ useDayColors: true, placeId: 2, placeDayMap: map, accommodationPlaceIds: new Set() })
    ).toEqual({ kind: 'numbered', dayIndex: 0, orderNumber: 0 });
  });
});

describe('dayMarkerHtml', () => {
  it('FE-MAP-DAYCOLOR-009: a numbered marker carries the day colour and the stop number', () => {
    const html = dayMarkerHtml({ kind: 'numbered', dayIndex: 3, orderNumber: 7 }, false, 'border-box');
    expect(html).toContain(getDayColor(3));
    expect(html).toContain('>7</div>');
    expect(html).toContain('box-sizing:border-box');
  });

  it("FE-MAP-DAYCOLOR-010: the pie has exactly one wedge per day, each in that day's colour", () => {
    const html = dayMarkerHtml({ kind: 'stay-multi', dayIndices: [0, 1, 4] }, false, 'border-box');
    // Wedges only: the home icon in the centre is a <path> too.
    expect(html.match(/stroke="#fff" stroke-width="0.5"/g)).toHaveLength(3);
    for (const d of [0, 1, 4]) expect(html).toContain(`fill="${getDayColor(d)}"`);
  });

  it('FE-MAP-DAYCOLOR-011: a selected marker is larger than an unselected one', () => {
    const small = dayMarkerBox({ kind: 'numbered', dayIndex: 0, orderNumber: 1 }, false);
    const large = dayMarkerBox({ kind: 'numbered', dayIndex: 0, orderNumber: 1 }, true);
    expect(large).toBeGreaterThan(small);
  });

  it('FE-MAP-DAYCOLOR-012: day colours past the fixed palette are still valid CSS colours', () => {
    const html = dayMarkerHtml({ kind: 'numbered', dayIndex: 12, orderNumber: 1 }, false, 'border-box');
    expect(html).toContain('hsl(');
  });
});

describe('dayMarkerElement', () => {
  it('FE-MAP-DAYCOLOR-013: builds a DOM element sized to the marker box for the GL renderers', () => {
    const spec = { kind: 'numbered', dayIndex: 1, orderNumber: 4 } as const;
    const el = dayMarkerElement(spec, true);
    const box = dayMarkerBox(spec, true);
    expect(el.style.width).toBe(`${box}px`);
    expect(el.style.height).toBe(`${box}px`);
    expect(el.textContent).toBe('4');
  });
});

describe('dayColorMapMode', () => {
  const data = {
    useDayColors: true,
    disableClustering: false,
    placeDayMap: map,
    selectedDayIndex: 2,
    accommodationPlaceIds: stays,
  };
  const clusterSource = () => ({ setData: vi.fn() });

  it("FE-MAP-DAYCOLOR-014: answers each place's marker as resolveDayMarker does, and the GL element for it", () => {
    const mode = dayColorMapMode(data);
    expect(mode.markerSpec(1)).toEqual({ kind: 'numbered', dayIndex: 2, orderNumber: 1 });
    expect(mode.markerSpec(99)).toBeNull();
    expect(mode.markerElement(99, false)).toBeNull();
    const el = mode.markerElement(1, true);
    expect(el?.textContent).toBe('1');
    expect(el?.style.width).toBe(`${dayMarkerBox({ kind: 'numbered', dayIndex: 2, orderNumber: 1 }, true)}px`);
    expect(dayColorMapMode({ ...data, useDayColors: false }).markerElement(1, false)).toBeNull();
  });

  it('FE-MAP-DAYCOLOR-015: with clustering on, the cluster source is left as it is', () => {
    const source = clusterSource();
    expect(dayColorMapMode(data).clearClusters(source)).toBe(false);
    expect(source.setData).not.toHaveBeenCalled();
  });

  it('FE-MAP-DAYCOLOR-016: with clustering off, the bubbles are emptied and every pin is drawn on its own', () => {
    const source = clusterSource();
    // The switch holds with day colours off too: it is a map setting of its own.
    expect(dayColorMapMode({ ...data, useDayColors: false, disableClustering: true }).clearClusters(source)).toBe(true);
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
  });
});
