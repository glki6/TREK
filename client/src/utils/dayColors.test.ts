import { describe, expect, it } from 'vitest';
import { WANDERLOG_COLORS, getDayColor, getDayRouteColor } from './dayColors';

// FE-UTIL-DAYCOLORS-001 to FE-UTIL-DAYCOLORS-004 (fork-only module)

describe('getDayColor', () => {
  it('FE-UTIL-DAYCOLORS-001: days 1–8 take the fixed palette', () => {
    expect(WANDERLOG_COLORS.map((_, i) => getDayColor(i))).toEqual([...WANDERLOG_COLORS]);
  });

  it('FE-UTIL-DAYCOLORS-002: later days get an evenly spaced hue, still a valid colour', () => {
    expect(getDayColor(8)).toMatch(/^hsl\([\d.]+, 60%, 45%\)$/);
    expect(getDayColor(8)).not.toBe(getDayColor(9));
    expect(getDayColor(-1)).toMatch(/^hsl\(/);
  });
});

describe('getDayRouteColor', () => {
  it('FE-UTIL-DAYCOLORS-003: the line is the day colour over a darker casing of the same hue', () => {
    expect(getDayRouteColor(0)).toEqual({ line: '#46cdcf', casing: '#319091' });
  });

  it('FE-UTIL-DAYCOLORS-004: past the palette the casing is the same hue, less light', () => {
    const { line, casing } = getDayRouteColor(10);
    const hue = /^hsl\(([\d.]+),/.exec(line)?.[1];
    expect(casing).toBe(`hsl(${hue}, 60%, 33%)`);
  });
});
