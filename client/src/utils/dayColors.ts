/**
 * Fork-only: the day palette of the day-colour map mode — Wanderlog's colours for
 * days 1–8, then an HSL ramp. `dayIndex` is the day's zero-based position in the trip.
 *
 * Every colour carries a white number: the fixed ones were checked against WCAG
 * contrast, and the ramp stays at 45 % lightness. Fixed values rather than theme
 * tokens for the same reason as the road trip palette (Roadtrip/dayColors.ts): they
 * paint the map and stand for a day, not for the app's surfaces.
 */

/** Wanderlog's original palette — one colour per day for days 1 through 8. */
export const WANDERLOG_COLORS = [
  '#46cdcf', // Day 1: teal
  '#7045af', // Day 2: purple
  '#3498db', // Day 3: blue
  '#f75940', // Day 4: orange-red
  '#17b978', // Day 5: green
  '#ec9b3b', // Day 6: amber
  '#2c365d', // Day 7: navy
  '#88304e', // Day 8: wine / maroon
] as const

/** Indices 0–7 → the fixed palette; 8 and up → evenly spaced hues wrapping at 360°. */
export function getDayColor(dayIndex: number): string {
  if (dayIndex >= 0 && dayIndex < WANDERLOG_COLORS.length) return WANDERLOG_COLORS[dayIndex]
  const hue = Math.round(((210 + Math.max(0, dayIndex) * 25.7) % 360) * 10) / 10
  return `hsl(${hue}, 60%, 45%)`
}

/** The same hue, darkened: the casing that keeps a line readable over water and forest. */
function darken(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return `#${[16, 8, 0].map(shift => Math.round(((n >> shift) & 0xff) * 0.7).toString(16).padStart(2, '0')).join('')}`
  }
  const hsl = /^hsl\(([\d.]+), (\d+)%, (\d+)%\)$/.exec(color)
  return hsl ? `hsl(${hsl[1]}, ${hsl[2]}%, ${Math.max(0, Number(hsl[3]) - 12)}%)` : color
}

/** Core and casing of a day's route line, in the shape the maps' `routeColors` take. */
export function getDayRouteColor(dayIndex: number): { line: string; casing: string } {
  const line = getDayColor(dayIndex)
  return { line, casing: darken(line) }
}
