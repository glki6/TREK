/**
 * Fork-only: the day-colour map mode on the Leaflet renderer (Map/dayColorLeaflet.ts),
 * on a real Leaflet map as in MapView.leaflet.test.tsx. FE-COMP-MAPVIEW-FORK-001 to 003.
 */
import L from 'leaflet';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildPlace } from '../../../tests/helpers/factories';
import { render, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { dayColorMapMode, type DayColorMapData } from './dayColorMarkers';
import { MapView } from './MapView';

vi.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    position: null,
    mode: 'off',
    error: null,
    errorCode: null,
    cycleMode: vi.fn(),
    setMode: vi.fn(),
  }),
}));

vi.mock('../../services/photoService', () => ({
  getCached: vi.fn(() => null),
  isLoading: vi.fn(() => false),
  fetchPhoto: vi.fn(),
  onThumbReady: vi.fn(() => () => {}),
  getAllThumbs: vi.fn(() => ({})),
}));

// A raster template keeps the basemap a plain TileLayer: the vector default needs WebGL.
const RASTER = 'https://tiles.example.test/{z}/{x}/{y}.png';

// Leaflet sizes the map from the container, which jsdom lays out at 0 x 0, and the
// cluster group only draws pins inside the visible bounds.
const sized = ['clientWidth', 'clientHeight'] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  L.Map.mergeOptions({ inertia: false });
  for (const key of sized) {
    originals.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => (key === 'clientWidth' ? 1000 : 700),
    });
  }
});
afterAll(() => {
  L.Map.mergeOptions({ inertia: true });
  for (const key of sized) {
    const original = originals.get(key);
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

afterEach(() => {
  resetAllStores();
});

const mapPlace = (id: number, name: string, lat: number, lng: number) => ({
  ...buildPlace({ id, name, lat, lng }),
  category_name: null,
  category_color: null,
  category_icon: null,
});

// Two stops in Nara a few hundred metres apart: separate pins at zoom 15.
const places = [mapPlace(1, 'Todai-ji', 34.689, 135.8398), mapPlace(2, 'Kasuga Taisha', 34.6812, 135.8484)];

const mode = (over: Partial<DayColorMapData> = {}) =>
  dayColorMapMode({
    useDayColors: true,
    disableClustering: false,
    placeDayMap: { 1: [{ dayIndex: 0, orderNumber: 1 }], 2: [{ dayIndex: 1, orderNumber: 2 }] },
    selectedDayIndex: null,
    accommodationPlaceIds: new Set<number>(),
    ...over,
  });

const pinsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('.leaflet-marker-icon[draggable="true"]'),
];

describe('MapView day colours on a real Leaflet map (fork)', () => {
  it("FE-COMP-MAPVIEW-FORK-001: with day colours on each stop wears its number in its day's colour", async () => {
    const { container } = render(
      <MapView
        places={places}
        center={[34.685, 135.844]}
        zoom={15}
        tileUrl={RASTER}
        selectedPlaceId={2}
        dayColorMode={mode()}
      />
    );
    // The cluster group takes its markers in on a timer (chunkedLoading).
    await waitFor(() => expect(pinsOf(container)).toHaveLength(2));
    const [todaiji, kasuga] = places.map(
      (p) => pinsOf(container).find((pin) => pin.innerHTML.includes(`>${p.id}</div>`)) as HTMLElement
    );
    expect(todaiji.innerHTML).toContain('#46cdcf'); // day 1
    expect(todaiji.style.width).toBe('36px');
    expect(kasuga.innerHTML).toContain('#7045af'); // day 2
    // The selected stop takes the larger marker.
    expect(kasuga.style.width).toBe('44px');
  });

  it("FE-COMP-MAPVIEW-FORK-002: with day colours off the pins are upstream's", async () => {
    const { container } = render(
      <MapView
        places={places}
        center={[34.685, 135.844]}
        zoom={15}
        tileUrl={RASTER}
        dayColorMode={mode({ useDayColors: false })}
      />
    );
    await waitFor(() => expect(pinsOf(container)).toHaveLength(2));
    for (const pin of pinsOf(container)) expect(pin.innerHTML).not.toContain('#46cdcf');
  });

  it('FE-COMP-MAPVIEW-FORK-003: with clustering switched off, stops a bubble would hold keep a pin each', async () => {
    // One building as two stops: no zoom takes them apart, so the cluster group always folds them.
    const stack = [mapPlace(1, 'Hotel', 34.689, 135.8398), mapPlace(2, 'Hotel spa', 34.689, 135.8398)];
    const clustered = render(<MapView places={stack} center={[34.689, 135.8398]} zoom={15} tileUrl={RASTER} />);
    await waitFor(() => expect(clustered.container.querySelector('.marker-cluster-custom')).not.toBeNull());
    expect(pinsOf(clustered.container)).toHaveLength(0);
    clustered.unmount();

    const { container } = render(
      <MapView
        places={stack}
        center={[34.689, 135.8398]}
        zoom={15}
        tileUrl={RASTER}
        dayColorMode={mode({ useDayColors: false, disableClustering: true })}
      />
    );
    await waitFor(() => expect(pinsOf(container)).toHaveLength(2));
    expect(container.querySelector('.marker-cluster-custom')).toBeNull();
  });
});
