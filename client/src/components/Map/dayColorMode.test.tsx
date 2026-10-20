import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DayColorPills, DayStopBadge } from './dayColorMode'
import { useMapDisplayStore } from '../../store/mapDisplayStore'

// FE-MAP-DAYCOLORMODE-001 to FE-MAP-DAYCOLORMODE-003 (fork-only module)

beforeEach(() => {
  localStorage.clear()
  useMapDisplayStore.setState({ dayColors: false, noCluster: false })
})

describe('DayColorPills', () => {
  it('FE-MAP-DAYCOLORMODE-001: the day-colour switch says what it will do, in the reader\'s language, and flips', () => {
    render(<DayColorPills />)
    const pill = screen.getByTestId('day-colors-pill')
    expect(pill).toHaveAttribute('aria-label', 'map.dayColors.show')
    expect(pill).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(pill)
    expect(useMapDisplayStore.getState().dayColors).toBe(true)
    expect(screen.getByTestId('day-colors-pill')).toHaveAttribute('aria-label', 'map.dayColors.hide')
    expect(screen.getByTestId('day-colors-pill')).toHaveAttribute('aria-pressed', 'true')
  })

  it('FE-MAP-DAYCOLORMODE-002: so does the clustering switch', () => {
    render(<DayColorPills />)
    const pill = screen.getByTestId('no-cluster-pill')
    expect(pill).toHaveAttribute('aria-label', 'map.clustering.off')

    fireEvent.click(pill)
    expect(useMapDisplayStore.getState().noCluster).toBe(true)
    expect(screen.getByTestId('no-cluster-pill')).toHaveAttribute('aria-label', 'map.clustering.on')
  })
})

describe('DayStopBadge', () => {
  it('FE-MAP-DAYCOLORMODE-003: shows the stop\'s number on its day\'s colour, hidden from screen readers like the photo it replaces', () => {
    render(<DayStopBadge badge={{ color: '#7045af', number: 7 }} size={28} />)
    const badge = screen.getByTestId('day-stop-badge')
    expect(badge).toHaveTextContent('7')
    expect(badge).toHaveStyle({ background: '#7045af', width: '28px', height: '28px' })
    expect(badge).toHaveAttribute('aria-hidden', 'true')
  })
})
