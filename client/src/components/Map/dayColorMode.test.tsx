import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPlace } from '../../../tests/helpers/factories';
import { useMapDisplayStore } from '../../store/mapDisplayStore';
import { DayColorPills, DayStopAvatar, DayStopBadge } from './dayColorMode';
import type { DayColors } from './useDayColors';

// FE-MAP-DAYCOLORMODE-001 to FE-MAP-DAYCOLORMODE-004 (fork-only module)

beforeEach(() => {
  localStorage.clear();
  useMapDisplayStore.setState({ dayColors: false, noCluster: false });
});

describe('DayColorPills', () => {
  it("FE-MAP-DAYCOLORMODE-001: the day-colour switch says what it will do, in the reader's language, and flips", () => {
    render(<DayColorPills />);
    const pill = screen.getByTestId('day-colors-pill');
    expect(pill).toHaveAttribute('aria-label', 'map.dayColors.show');
    expect(pill).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pill);
    expect(useMapDisplayStore.getState().dayColors).toBe(true);
    expect(screen.getByTestId('day-colors-pill')).toHaveAttribute('aria-label', 'map.dayColors.hide');
    expect(screen.getByTestId('day-colors-pill')).toHaveAttribute('aria-pressed', 'true');
  });

  it('FE-MAP-DAYCOLORMODE-002: so does the clustering switch', () => {
    render(<DayColorPills />);
    const pill = screen.getByTestId('no-cluster-pill');
    expect(pill).toHaveAttribute('aria-label', 'map.clustering.off');

    fireEvent.click(pill);
    expect(useMapDisplayStore.getState().noCluster).toBe(true);
    expect(screen.getByTestId('no-cluster-pill')).toHaveAttribute('aria-label', 'map.clustering.on');
  });
});

describe('DayStopBadge', () => {
  it("FE-MAP-DAYCOLORMODE-003: shows the stop's number on its day's colour, hidden from screen readers like the photo it replaces", () => {
    render(<DayStopBadge badge={{ color: '#7045af', number: 7 }} size={28} />);
    const badge = screen.getByTestId('day-stop-badge');
    expect(badge).toHaveTextContent('7');
    expect(badge).toHaveStyle({ background: '#7045af', width: '28px', height: '28px' });
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('DayStopAvatar', () => {
  it("FE-MAP-DAYCOLORMODE-004: wears the stop's badge when the model numbers it, the place's own avatar otherwise", () => {
    const colors = {
      stopBadge: (id: number, dayId: number) => (id === 1 && dayId === 10 ? { color: '#46cdcf', number: 3 } : null),
    } as unknown as DayColors;
    const place = buildPlace({ id: 5, name: 'Louvre', image_url: null });
    const { rerender } = render(<DayStopAvatar colors={colors} id={1} dayId={10} place={place} category={null} />);
    expect(screen.getByTestId('day-stop-badge')).toHaveStyle({ width: '32px' });
    expect(screen.getByTestId('day-stop-badge')).toHaveTextContent('3');

    rerender(<DayStopAvatar colors={colors} id={2} dayId={10} place={place} category={null} size={27} />);
    expect(screen.queryByTestId('day-stop-badge')).toBeNull();
    rerender(<DayStopAvatar id={1} dayId={10} place={place} category={null} />);
    expect(screen.queryByTestId('day-stop-badge')).toBeNull();
  });
});
