import { describe, expect, it, vi } from 'vitest';
import { PlaceRow } from '../../../../src/mobile/screens/trip/plan/MPlanTimelineRows';
import type { Assignment, TranslationFn } from '../../../../src/types';
import { render, screen } from '../../../helpers/render';

// FE-MOB-PLROW-FORK-001 to FE-MOB-PLROW-FORK-003
//
// Fork-only: with day colours on, a phone plan row wears the number its pin wears on the
// map, in its day's colour (components/Map/useDayColors.ts), like the desktop day plan.

const t: TranslationFn = (key) => key;
const chrome = (editing = false) => ({ editing, t, language: 'en', timeFormat: '24h' });
const assignment = {
  id: 11,
  day_id: 2,
  place_id: 101,
  order_index: 0,
  place: { id: 101, name: 'Museum', lat: 35.71, lng: 139.79 },
} as unknown as Assignment;
const props = {
  assignment,
  fullPlace: undefined,
  linkedReservations: [],
  reorder: null,
  onOpen: vi.fn(),
  onRemove: vi.fn(),
};

describe('PlaceRow day colours', () => {
  it("FE-MOB-PLROW-FORK-001: a row with a badge shows its number on its day's colour instead of the photo", () => {
    render(<PlaceRow {...props} chrome={chrome()} dayBadge={{ color: '#7045af', number: 3 }} />);
    const badge = screen.getByTestId('day-stop-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveStyle({ background: '#7045af', width: '27px' });
  });

  it("FE-MOB-PLROW-FORK-002: without one it is upstream's row", () => {
    render(<PlaceRow {...props} chrome={chrome()} dayBadge={null} />);
    expect(screen.queryByTestId('day-stop-badge')).not.toBeInTheDocument();
    expect(screen.getByText('Museum')).toBeInTheDocument();
  });

  it("FE-MOB-PLROW-FORK-003: in editing mode the avatar slot is the action circles', badge or not", () => {
    render(<PlaceRow {...props} chrome={chrome(true)} dayBadge={{ color: '#7045af', number: 3 }} />);
    expect(screen.queryByTestId('day-stop-badge')).not.toBeInTheDocument();
  });
});
