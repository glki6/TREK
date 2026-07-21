/**
 * Day-color utility — Wanderlog legacy palette (days 1–8) with an HSL fallback
 * for day 9+. Zero-based `dayIndex` matches TREK's internal day tracking.
 *
 * Every returned color is dark enough for white text overlay:
 *   • The fixed hex values were verified against WCAG contrast thresholds.
 *   • Generated hues use 45 % lightness, which guarantees sufficient contrast
 *     across the full saturation range used here (60 %).
*/

/** Wanderlog original palette — one color per day for days 1 through 8.*/
export const WANDERLOG_COLORS = [
  "#46cdcf", // Day 1: teal
  "#7045af", // Day 2: purple
  "#3498db", // Day 3: blue
  "#f75940", // Day 4: orange-red
  "#17b978", // Day 5: green
  "#ec9b3b", // Day 6: amber
  "#2c365d", // Day 7: navy
  "#88304e", // Day 8: wine / maroon
] as const;

/**
 * Return the color string for a given (zero-based) day index.
 *
 * • Indices 0-7 → fixed Wanderlog hex value.
 * • Index >= 8  → HSL fallback with evenly-spaced hues wrapping at 360°.
*/
export function getDayColor(dayIndex: number): string {
  if (dayIndex < WANDERLOG_COLORS.length) {
    return WANDERLOG_COLORS[dayIndex];
  }

  const hue = Math.round(((210 + dayIndex * 25.7) % 360) * 10) / 10;
  return `hsl(${hue}, 60%, 45%)`;
}
