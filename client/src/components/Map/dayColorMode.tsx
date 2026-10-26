import { Grid3x3, Palette } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from '../../i18n';
import { useMapDisplayStore } from '../../store/mapDisplayStore';
import PlaceAvatar from '../shared/PlaceAvatar';
import { Tooltip } from '../shared/Tooltip';
import { MAP_CONTROL_SHADOW } from './mapControlShadow';
import type { DayColors, DayStopBadgeSpec } from './useDayColors';

/**
 * Fork-only: the day-colour map mode's switches and the stop badge of its plan lists.
 * The model they draw from is useDayColors.ts.
 */

/**
 * A stop's number in its day's colour, in place of its photo in a plan list — the
 * same number its pin wears on the map. White on the palette, which was picked to
 * carry it (utils/dayColors.ts).
 */
export function DayStopBadge({ badge, size }: { badge: DayStopBadgeSpec; size: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="day-stop-badge"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: badge.color,
        color: 'white', // on the day palette, which is the same in every scheme (utils/dayColors.ts)
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: `calc(${Math.round(size / 2)}px * var(--fs-scale-body, 1))`,
        lineHeight: 1,
      }}
    >
      {badge.number}
    </div>
  );
}

/**
 * A plan row's avatar: with day colours on, the stop's number in its day's colour (the
 * number its pin wears on the map); otherwise upstream's photo or category icon.
 */
export function DayStopAvatar({
  colors,
  id,
  dayId,
  ...avatar
}: { colors?: DayColors; id: number; dayId: number } & ComponentProps<typeof PlaceAvatar>) {
  const badge = colors?.stopBadge(id, dayId);
  return badge ? <DayStopBadge badge={badge} size={avatar.size ?? 32} /> : <PlaceAvatar {...avatar} />;
}

/** Same frosted shell as the other map pills (see TripRouteOverviewPill). */
function MapTogglePill({
  active,
  onToggle,
  label,
  testId,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 4,
        borderRadius: 999,
        pointerEvents: 'auto',
        background: 'var(--sidebar-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: MAP_CONTROL_SHADOW,
      }}
    >
      <Tooltip label={label} placement="left">
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-pressed={active}
          data-testid={testId}
          className={active ? 'text-accent' : 'text-content-muted'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            padding: 0,
            transition: 'background 0.14s, color 0.14s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {children}
        </button>
      </Tooltip>
    </div>
  );
}

/** Both switches, stacked the way the other pills in the bottom-right cluster are. */
export function DayColorPills() {
  const { t } = useTranslation();
  const dayColors = useMapDisplayStore((s) => s.dayColors);
  const noCluster = useMapDisplayStore((s) => s.noCluster);
  const toggleDayColors = useMapDisplayStore((s) => s.toggleDayColors);
  const toggleClustering = useMapDisplayStore((s) => s.toggleClustering);
  return (
    <>
      <MapTogglePill
        active={dayColors}
        onToggle={toggleDayColors}
        label={dayColors ? t('map.dayColors.hide') : t('map.dayColors.show')}
        testId="day-colors-pill"
      >
        <Palette size={17} strokeWidth={2} />
      </MapTogglePill>
      <MapTogglePill
        active={noCluster}
        onToggle={toggleClustering}
        label={noCluster ? t('map.clustering.on') : t('map.clustering.off')}
        testId="no-cluster-pill"
      >
        <Grid3x3 size={17} strokeWidth={2} />
      </MapTogglePill>
    </>
  );
}
