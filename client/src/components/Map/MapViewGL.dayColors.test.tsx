import { act } from '@testing-library/react';
import * as maplibregl from 'maplibre-gl';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace } from '../../../tests/helpers/factories';
import { render } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import type { GeoPosition, TrackingMode } from '../../hooks/useGeolocation';
import { useSettingsStore } from '../../store/settingsStore';
import { dayColorMapMode, type DayColorMapData } from './dayColorMarkers';

// Fork-only: the day-colour map mode on the GL renderers (Map/dayColorMarkers.ts),
// FE-COMP-MAPVIEWGL-FORK-001 to 004, with the same map doubles as MapViewGL.test.tsx.

// Stable fake map so fitBounds call counts survive re-renders. The canvas
// container is a single element so listeners registered by the component are
// reachable from tests via dispatchEvent.
const glCanvasContainer = vi.hoisted(() => document.createElement('div'));
const glMap = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  loaded: vi.fn().mockReturnValue(true),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  jumpTo: vi.fn(),
  getZoom: vi.fn().mockReturnValue(10),
  getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
  addControl: vi.fn(),
  removeControl: vi.fn(),
  remove: vi.fn(),
  addSource: vi.fn(),
  getSource: vi.fn().mockReturnValue(null),
  addLayer: vi.fn(),
  // Every overlay that adds a layer takes it away again on cleanup; a real
  // MapLibre/Mapbox map has both halves, and a double with only the adding half
  // fails the teardown rather than the behaviour under test.
  removeLayer: vi.fn(),
  removeSource: vi.fn(),
  setLayoutProperty: vi.fn(),
  setFilter: vi.fn(),
  hasImage: vi.fn().mockReturnValue(false),
  addImage: vi.fn(),
  removeImage: vi.fn(),
  getStyle: vi.fn().mockReturnValue({ layers: [] }),
  isStyleLoaded: vi.fn().mockReturnValue(true),
  getCanvasContainer: vi.fn(() => glCanvasContainer),
  getContainer: vi.fn(() => glCanvasContainer),
  getLayer: vi.fn().mockReturnValue(null),
  queryRenderedFeatures: vi.fn().mockReturnValue([]),
  querySourceFeatures: vi.fn().mockReturnValue([]),
  unproject: vi.fn(() => ({ lng: 2.3522, lat: 48.8566 })),
  // The MapLibre place pins position themselves with this, so a mock without it
  // never exercises the path the real map takes.
  project: vi.fn((lngLat: [number, number]) => ({ x: lngLat[0] * 10, y: lngLat[1] * 10 })),
  getBounds: vi.fn(() => ({ getSouth: () => 0, getWest: () => 0, getNorth: () => 1, getEast: () => 1 })),
  easeTo: vi.fn(),
  getCanvas: vi.fn(() => document.createElement('canvas')),
  getBearing: vi.fn(() => 0),
  setTerrain: vi.fn(),
  setConfigProperty: vi.fn(),
  queryTerrainElevation: vi.fn((): number | null => null),
}));

const glBounds = vi.hoisted(() => {
  const state = {
    instances: [] as Array<{ extend: ReturnType<typeof vi.fn> }>,
  };
  return {
    get instances() {
      return state.instances;
    },
    clear: () => {
      state.instances = [];
    },
    create: () => {
      const bounds = {
        extend: vi.fn(() => bounds),
      };
      state.instances.push(bounds);
      return bounds;
    },
  };
});

// Markers and popups are created through the mocked GL constructors, so the
// tests can reach the very instances the component built (their DOM element,
// the coordinates they were placed at, the popup content they were given).
interface FakeMarker {
  element: HTMLElement;
  lngLat: number[] | null;
  setLngLat: (ll: number[]) => FakeMarker;
  getLngLat: () => { lng: number; lat: number };
  addTo: (map: unknown) => FakeMarker;
  remove: () => void;
  getElement: () => HTMLElement;
}

interface FakePopup {
  setLngLat: (ll: unknown) => FakePopup;
  setHTML: (html: string) => FakePopup;
  setText: (text: string) => FakePopup;
  setDOMContent: (node: HTMLElement) => FakePopup;
  addTo: (map: unknown) => FakePopup;
  remove: () => void;
}

const glMarkers = vi.hoisted(() => {
  const created: FakeMarker[] = [];
  return {
    get created() {
      return created;
    },
    clear: () => {
      created.length = 0;
    },
    make: (opts?: { element?: HTMLElement }): FakeMarker => {
      const element = opts?.element ?? document.createElement('div');
      const marker: FakeMarker = {
        element,
        lngLat: null,
        setLngLat: vi.fn((ll: number[]) => {
          marker.lngLat = ll;
          return marker;
        }),
        getLngLat: vi.fn(() => ({ lng: Number(marker.lngLat?.[0] ?? 0), lat: Number(marker.lngLat?.[1] ?? 0) })),
        addTo: vi.fn((_map: unknown) => marker),
        remove: vi.fn(),
        getElement: vi.fn(() => element),
      };
      created.push(marker);
      return marker;
    },
  };
});

const glPopup = vi.hoisted((): FakePopup => {
  const popup: FakePopup = {
    setLngLat: vi.fn((_ll: unknown) => popup),
    setHTML: vi.fn((_html: string) => popup),
    setText: vi.fn((_text: string) => popup),
    setDOMContent: vi.fn((_node: HTMLElement) => popup),
    addTo: vi.fn((_map: unknown) => popup),
    remove: vi.fn(),
  };
  return popup;
});

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: vi.fn(function () {
      return glMap;
    }),
    Marker: vi.fn(function (opts?: { element?: HTMLElement }) {
      return glMarkers.make(opts);
    }),
    LngLatBounds: vi.fn(function () {
      return glBounds.create();
    }),
    NavigationControl: vi.fn(),
    Popup: vi.fn(function () {
      return glPopup;
    }),
  },
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

// maplibre-gl 6 has no default export, so the fakes are named exports.
vi.mock('maplibre-gl', () => ({
  Map: vi.fn(function () {
    return glMap;
  }),
  Marker: vi.fn(function (opts?: { element?: HTMLElement }) {
    return glMarkers.make(opts);
  }),
  LngLatBounds: vi.fn(function () {
    return glBounds.create();
  }),
  NavigationControl: vi.fn(),
  Popup: vi.fn(function () {
    return glPopup;
  }),
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

vi.mock('./mapboxSetup', () => ({
  isStandardFamily: vi.fn(() => false),
  supportsCustom3d: vi.fn(() => false),
  wantsTerrain: vi.fn(() => false),
  addCustom3dBuildings: vi.fn(),
  addTerrainAndSky: vi.fn(),
}));

const locationMarker = vi.hoisted(() => ({ update: vi.fn(), destroy: vi.fn() }));

vi.mock('./locationMarkerMapbox', () => ({
  attachLocationMarker: vi.fn(() => locationMarker),
}));

const reservationOverlay = vi.hoisted(() => ({
  update: vi.fn((_reservations: unknown, _opts: unknown, _routes: unknown) => {}),
  destroy: vi.fn(),
}));

vi.mock('./reservationsMapbox', () => ({
  ReservationMapboxOverlay: vi.fn(function () {
    return reservationOverlay;
  }),
}));

const geoStub = vi.hoisted(() => ({
  position: null as GeoPosition | null,
  mode: 'off' as TrackingMode,
  error: null as string | null,
  errorCode: null as string | null,
  cycleMode: vi.fn(async () => {}),
  setMode: vi.fn((_m: TrackingMode | ((prev: TrackingMode) => TrackingMode)) => {}),
}));

vi.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => geoStub),
}));

vi.mock('../../services/photoService', () => ({
  getCached: vi.fn(() => null),
  isLoading: vi.fn(() => false),
  fetchPhoto: vi.fn(),
  onThumbReady: vi.fn(() => () => {}),
  getAllThumbs: vi.fn(() => ({})),
}));

import mapboxgl from 'mapbox-gl';
import * as photoService from '../../services/photoService';
import { MapViewGL as MapViewGLWithEngine } from './MapViewGL';
import * as mapboxSetup from './mapboxSetup';

// The engine is a prop, not a module import (see MapViewGL.test.tsx). This shim makes
// the same choice glLazy.tsx makes in production.
function MapViewGL(props: Omit<React.ComponentProps<typeof MapViewGLWithEngine>, 'gl'>) {
  return <MapViewGLWithEngine {...props} gl={props.glProvider === 'maplibre-gl' ? maplibregl : mapboxgl} />;
}

beforeEach(() => {
  glMap.on.mockImplementation((event: string, handlerOrLayer: unknown) => {
    // Nothing beyond the bare map is wired up until the style reports 'load'.
    if (event === 'load' && typeof handlerOrLayer === 'function') (handlerOrLayer as () => void)();
    return glMap;
  });
  glMap.off.mockImplementation(() => glMap);
  glMap.once.mockImplementation(() => glMap);
  glMap.loaded.mockReturnValue(true);
  glMap.getLayer.mockReturnValue(null);
  glMap.queryRenderedFeatures.mockReturnValue([]);
  glMap.getCanvas.mockImplementation(() => document.createElement('canvas'));
  glMap.getBearing.mockReturnValue(0);
  glMap.queryTerrainElevation.mockReturnValue(null);
  glMap.isStyleLoaded.mockReturnValue(true);
  glMap.getStyle.mockReturnValue({ layers: [] });
  glMap.addSource.mockImplementation(() => undefined);
  // Far enough apart at a day's zoom that no two pins fold into one.
  glMap.project.mockImplementation((lngLat: [number, number]) => ({ x: lngLat[0] * 1500, y: lngLat[1] * 1500 }));
  glMap.getSource.mockImplementation((id: string) => (id === 'trip-place-clusters' ? clusterSource : null));
  clusterSource.setData.mockClear();
  glMarkers.clear();
  vi.mocked(mapboxSetup.isStandardFamily).mockReturnValue(false);
  vi.mocked(mapboxSetup.supportsCustom3d).mockReturnValue(false);
  vi.mocked(mapboxSetup.wantsTerrain).mockReturnValue(false);
  vi.mocked(photoService.getCached).mockReturnValue(undefined);
  vi.mocked(photoService.isLoading).mockReturnValue(false);
  vi.mocked(photoService.onThumbReady).mockReturnValue(() => {});
  vi.mocked(photoService.getAllThumbs).mockReturnValue({});
  geoStub.position = null;
  geoStub.mode = 'off';
  geoStub.error = null;
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      map_provider: 'mapbox-gl',
      mapbox_access_token: 'pk.test_token',
      mapbox_style: 'mapbox://styles/mapbox/streets-v12',
      mapbox_3d_enabled: false,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  glBounds.clear();
  resetAllStores();
});

const clusterSource = { setData: vi.fn((_data: unknown) => {}) };
const flushFrames = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

const mapPlace = (id: number, lng: number, lat: number) => ({
  ...buildPlace({ id, lat, lng }),
  category_name: null,
  category_color: null,
  category_icon: null,
});

const mode = (over: Partial<DayColorMapData> = {}) =>
  dayColorMapMode({
    useDayColors: false,
    disableClustering: false,
    placeDayMap: {},
    selectedDayIndex: null,
    accommodationPlaceIds: new Set<number>(),
    ...over,
  });

const pinAt = (lng: number) => glMarkers.created.find((m) => m.lngLat?.[0] === lng);
const drawn = () => glMarkers.created.map((m) => m.lngLat);

describe('MapViewGL day colours (fork)', () => {
  const places = [mapPlace(61, 2.1, 48.1), mapPlace(62, 2.2, 48.2), mapPlace(63, 2.3, 48.3)];

  it('FE-COMP-MAPVIEWGL-FORK-001: with clustering switched off every place keeps a pin and the bubbles are emptied', async () => {
    // The source would still call 63 clustered; switched off, it is not asked.
    glMap.querySourceFeatures.mockReturnValue([{ properties: { placeId: 61 } }, { properties: { placeId: 62 } }]);

    render(<MapViewGL places={places} fitKey={1} dayColorMode={mode({ disableClustering: true })} />);
    await flushFrames();

    const calls = clusterSource.setData.mock.calls;
    expect(calls[calls.length - 1][0]).toEqual({ type: 'FeatureCollection', features: [] });
    for (const at of [
      [2.1, 48.1],
      [2.2, 48.2],
      [2.3, 48.3],
    ])
      expect(drawn()).toContainEqual(at);
  });

  it('FE-COMP-MAPVIEWGL-FORK-002: with clustering on, a clustered place stays in its bubble as upstream draws it', async () => {
    glMap.querySourceFeatures.mockReturnValue([{ properties: { placeId: 61 } }, { properties: { placeId: 62 } }]);

    render(<MapViewGL places={places} fitKey={1} dayColorMode={mode()} />);
    await flushFrames();

    expect(drawn()).toContainEqual([2.1, 48.1]);
    expect(drawn()).not.toContainEqual([2.3, 48.3]);
  });

  it("FE-COMP-MAPVIEWGL-FORK-003: with day colours on a stop wears its number in its day's colour", async () => {
    glMap.querySourceFeatures.mockReturnValue([{ properties: { placeId: 64 } }, { properties: { placeId: 65 } }]);
    const dayColorMode = mode({ useDayColors: true, placeDayMap: { 64: [{ dayIndex: 2, orderNumber: 4 }] } });

    render(
      <MapViewGL places={[mapPlace(64, 2.4, 48.4), mapPlace(65, 2.5, 48.5)]} fitKey={1} dayColorMode={dayColorMode} />
    );
    await flushFrames();

    const pin = pinAt(2.4);
    expect(pin?.element.innerHTML).toContain('#3498db'); // day 3 of the palette
    expect(pin?.element.textContent).toBe('4');
    // A place on no day keeps upstream's pin.
    expect(pinAt(2.5)?.element.innerHTML).not.toContain('#3498db');
  });

  it('FE-COMP-MAPVIEWGL-FORK-004: the selected stop takes the selected day marker, and day colours off bring back the pin', async () => {
    glMap.querySourceFeatures.mockReturnValue([{ properties: { placeId: 64 } }]);
    const placeDayMap = { 64: [{ dayIndex: 0, orderNumber: 1 }] };
    const stop = [mapPlace(64, 2.4, 48.4)];
    const { rerender } = render(
      <MapViewGL
        places={stop}
        fitKey={1}
        selectedPlaceId={64}
        dayColorMode={mode({ useDayColors: true, placeDayMap })}
      />
    );
    await flushFrames();
    const selected = pinAt(2.4)?.element.innerHTML ?? '';
    expect(selected).toContain('background:#46cdcf'); // day 1 of the palette
    expect(selected).toContain('border:3px solid white'); // the day marker's selected ring

    glMarkers.clear();
    rerender(<MapViewGL places={stop} fitKey={1} selectedPlaceId={64} dayColorMode={mode({ placeDayMap })} />);
    await flushFrames();
    expect(pinAt(2.4)?.element.innerHTML).not.toContain('#46cdcf');
  });
});
