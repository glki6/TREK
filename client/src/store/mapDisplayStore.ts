import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Fork-only: how the trip map draws its stops — coloured by day, and grouped into
 * clusters or not. One store for the desktop planner and the phone map, kept per
 * browser so the choice survives a reload.
 */
interface MapDisplayState {
  /** Colour every stop, its route and its day by the day it belongs to. */
  dayColors: boolean
  /** Draw every marker on its own instead of grouping nearby ones into a bubble. */
  noCluster: boolean
  toggleDayColors: () => void
  toggleClustering: () => void
}

export const useMapDisplayStore = create<MapDisplayState>()(
  persist(
    (set) => ({
      dayColors: false,
      noCluster: false,
      toggleDayColors: () => set((s) => ({ dayColors: !s.dayColors })),
      toggleClustering: () => set((s) => ({ noCluster: !s.noCluster })),
    }),
    {
      name: 'trek.fork.map-display',
      partialize: (s) => ({ dayColors: s.dayColors, noCluster: s.noCluster }),
    },
  ),
)
