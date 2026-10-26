// FE-PLANNER-DAYPLAN-FORK-001 to FE-PLANNER-DAYPLAN-FORK-006
//
// Fork-only: what this fork adds to the day plan — the whole-trip Google Maps export
// and the day colours of the badges and stops. Kept out of DayPlanSidebar.test.tsx so
// upstream's suite merges without conflicts; the mocks are the subset of that suite's
// that a render of the sidebar needs. RouteCalculator is real here: the export link is
// the thing under test.
import { buildAssignment, buildDay, buildPlace, buildTrip } from '../../../tests/helpers/factories';
import { fireEvent, render, screen, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import type { Accommodation } from '../../types';
import type { DayColors } from '../Map/useDayColors';
import DayPlanSidebar from './DayPlanSidebar';

const mockDayNotesState = vi.hoisted(() => ({
  noteUi: {},
  dayNotes: {},
  setNoteUi: vi.fn(),
  noteInputRef: { current: null },
  openAddNote: vi.fn(),
  openEditNote: vi.fn(),
  cancelNote: vi.fn(),
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
  moveNote: vi.fn(),
}));
vi.mock('../../hooks/useDayNotes', () => ({ useDayNotes: () => mockDayNotesState }));
vi.mock('../PDF/TripPDF', () => ({ downloadTripPDF: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/photoService', () => ({
  getCached: vi.fn(() => null),
  isLoading: vi.fn(() => false),
  fetchPhoto: vi.fn(),
  onThumbReady: vi.fn(() => () => {}),
}));
vi.mock('../Weather/WeatherWidget', () => ({ default: () => null }));
const mockToast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../shared/Toast', () => ({ useToast: () => mockToast }));
vi.mock('../../store/permissionsStore', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useCanDo: () => () => true };
});

class MockIO {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIO;
});

const trip = buildTrip({ id: 1, currency: 'EUR' });
const day1 = buildDay({ id: 10, day_number: 1, date: '2025-06-01', title: 'Day 1' });
const day2 = buildDay({ id: 11, day_number: 2, date: '2025-06-02', title: 'Day 2' });
const louvre = buildPlace({ id: 101, name: 'Louvre', lat: 48.8606, lng: 2.3376 });
const orsay = buildPlace({ id: 102, name: 'Orsay', lat: 48.86, lng: 2.3266 });
const hotel = {
  id: 1,
  start_day_id: 10,
  end_day_id: 11,
  place_lat: 48.85,
  place_lng: 2.35,
  place_name: 'Hotel',
} as unknown as Accommodation;

function props(overrides: Record<string, unknown> = {}) {
  return {
    tripId: 1,
    trip,
    days: [day1, day2],
    places: [louvre, orsay],
    categories: [],
    assignments: {
      '10': [buildAssignment({ id: 1, day_id: 10, order_index: 0, place: louvre })],
      '11': [buildAssignment({ id: 2, day_id: 11, order_index: 0, place: orsay })],
    },
    selectedDayId: null,
    selectedPlaceId: null,
    selectedAssignmentId: null,
    onSelectDay: vi.fn(),
    onPlaceClick: vi.fn(),
    onDayDetail: vi.fn(),
    accommodations: [hotel],
    onReorder: vi.fn(),
    onUpdateDayTitle: vi.fn(),
    onRouteCalculated: vi.fn(),
    onAssignToDay: vi.fn(),
    onRemoveAssignment: vi.fn(),
    onEditPlace: vi.fn(),
    onDeletePlace: vi.fn(),
    reservations: [],
    onAddReservation: vi.fn(),
    onNavigateToFiles: vi.fn(),
    ...overrides,
  };
}

let open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  open = vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => {
  open.mockRestore();
});

const exportTrip = () => fireEvent.click(screen.getByRole('button', { name: 'Open all stops in Google Maps' }));
const openedStops = () => String(open.mock.calls[0][0]).split('/dir/')[1].split('/');

describe('whole-trip Google Maps export', () => {
  it("FE-PLANNER-DAYPLAN-FORK-001: the hotel the trip sleeps in is part of the route, as in each day's own export", () => {
    render(<DayPlanSidebar {...props()} />);
    exportTrip();
    expect(open).toHaveBeenCalledTimes(1);
    const stops = openedStops();
    expect(stops).toContain('48.85,2.35');
    expect(stops.indexOf('48.8606,2.3376')).toBeLessThan(stops.indexOf('48.86,2.3266'));
    // Ending day 1 and starting day 2 at the same hotel lists it once, not twice in a row.
    expect(stops.filter((s, i) => s === stops[i - 1])).toEqual([]);
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it('FE-PLANNER-DAYPLAN-FORK-002: with "optimize from accommodation" off no hotel is added, as per day', async () => {
    const { useSettingsStore } = await import('../../store/settingsStore');
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, optimize_from_accommodation: false } }));
    render(<DayPlanSidebar {...props()} />);
    exportTrip();
    expect(openedStops()).toEqual(['48.8606,2.3376', '48.86,2.3266']);
  });

  it("FE-PLANNER-DAYPLAN-FORK-003: past Google's ten stops the route is cut, and the traveller is told", () => {
    const places = Array.from({ length: 12 }, (_, i) =>
      buildPlace({ id: 200 + i, name: `Stop ${i}`, lat: 48 + i / 100, lng: 2 })
    );
    render(
      <DayPlanSidebar
        {...props({
          places,
          accommodations: [],
          assignments: {
            '10': places
              .slice(0, 6)
              .map((p, i) => buildAssignment({ id: 30 + i, day_id: 10, order_index: i, place: p })),
            '11': places.slice(6).map((p, i) => buildAssignment({ id: 40 + i, day_id: 11, order_index: i, place: p })),
          },
        })}
      />
    );
    exportTrip();
    expect(openedStops()).toHaveLength(10);
    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('10'), 6000);
    expect(mockToast.warning.mock.calls[0][0]).toContain('12');
  });
});

describe('day colours in the day plan', () => {
  const dayColors = {
    active: true,
    colorOfDay: (dayId: number) => (dayId === 10 ? '#46cdcf' : '#7045af'),
    stopBadge: (assignmentId: number) => (assignmentId === 2 ? { color: '#7045af', number: 1 } : null),
  } as unknown as DayColors;

  it("FE-PLANNER-DAYPLAN-FORK-004: a stop the model numbers shows its number in its day's colour instead of its photo", () => {
    render(<DayPlanSidebar {...props({ dayColors })} />);
    const badges = screen.getAllByTestId('day-stop-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('1');
    expect(badges[0]).toHaveStyle({ background: '#7045af' });
  });

  it("FE-PLANNER-DAYPLAN-FORK-006: each day's number tile takes its day's colour, over the selection's", () => {
    render(<DayPlanSidebar {...props({ dayColors, selectedDayId: 11 })} />);
    const tile = (n: string) =>
      screen
        .getAllByText(n)
        .map((el) => el.parentElement as HTMLElement)
        .find((el) => el.className.includes('rounded-[10px]'));
    expect(tile('1')).toHaveStyle({ background: '#46cdcf', color: 'rgb(255, 255, 255)' });
    expect(tile('2')).toHaveStyle({ background: '#7045af', color: 'rgb(255, 255, 255)' });
  });

  it("FE-PLANNER-DAYPLAN-FORK-005: without the model the day plan is upstream's, photos and all", () => {
    render(<DayPlanSidebar {...props()} />);
    expect(screen.queryByTestId('day-stop-badge')).not.toBeInTheDocument();
    expect(within(document.body).getAllByText('Louvre').length).toBeGreaterThan(0);
  });
});
