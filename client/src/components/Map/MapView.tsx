import { useEffect, useRef, useState, useMemo, useCallback, createElement, memo } from 'react'
import DOM from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Circle, useMap, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { mapsApi } from '../../api/client'
import { getCategoryIcon, CATEGORY_ICON_MAP } from '../shared/categoryIcons'
import ReservationOverlay from './ReservationOverlay'
import { useTransportRoutes } from '../../hooks/useTransportRoutes'
import { getDayColor } from '../../utils/dayColors'
import type { Reservation } from '../../types'
import { POI_CATEGORY_BY_KEY, type Poi } from './poiCategories'

function categoryIconSvg(iconName: string | null | undefined, size: number): string {
  const IconComponent = (iconName && CATEGORY_ICON_MAP[iconName]) || CATEGORY_ICON_MAP['MapPin']
  try {
    return renderToStaticMarkup(createElement(IconComponent, { size, color: 'white', strokeWidth: 2.5 }))
  } catch { return '' }
}
import type { Place } from '../../types'

// Fix default marker icons for vite. `_getIconUrl` is a Leaflet-internal field
// not present in the public typings, so narrow to delete it.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

/**
 * Create a round photo-circle marker.
 * Shows image_url if available, otherwise category icon in colored circle.
 */
function escAttr(s) {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const iconCache = new Map<string, L.DivIcon>()

function createPlaceIcon(place, orderNumbers, isSelected) {
  const cacheKey = `${place.id}:${isSelected}:${place.image_url || ''}:${place.category_color || ''}:${place.category_icon || ''}:${orderNumbers?.join(',') || ''}`
  const cached = iconCache.get(cacheKey)
  if (cached) return cached
  const size = isSelected ? 44 : 36
  const borderColor = isSelected ? '#111827' : (place.category_color || 'white')
  const borderWidth = isSelected ? 3 : 2.5
  const shadow = isSelected
    ? '0 0 0 3px rgba(17,24,39,0.25), 0 4px 14px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.22)'
  const bgColor = place.category_color || '#6b7280'

  // Number badges (bottom-right)
  let badgeHtml = ''
  if (orderNumbers && orderNumbers.length > 0) {
    const label = orderNumbers.join(' · ')
    badgeHtml = `<span style="
      position:absolute;bottom:-4px;right:-4px;
      min-width:18px;height:${orderNumbers.length > 1 ? 16 : 18}px;border-radius:${orderNumbers.length > 1 ? 8 : 9}px;
      padding:0 ${orderNumbers.length > 1 ? 4 : 3}px;
      background:rgba(255,255,255,0.94);
      border:1.5px solid rgba(0,0,0,0.15);
      box-shadow:0 1px 4px rgba(0,0,0,0.18);
      display:flex;align-items:center;justify-content:center;
      font-size:${orderNumbers.length > 1 ? 7.5 : 9}px;font-weight:800;color:#111827;
      font-family:var(--font-system);line-height:1;
      box-sizing:border-box;white-space:nowrap;
    ">${label}</span>`
  }

  // Prefer base64 data URLs (no zoom lag); also accept same-origin proxy URLs as a fallback
  // while the thumb is still being generated in the background
  if (place.image_url && (place.image_url.startsWith('data:') || place.image_url.startsWith('/api/maps/place-photo/'))) {
    const imgIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;
        cursor:pointer;position:relative;
      ">
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          border:${borderWidth}px solid ${borderColor};
          box-shadow:${shadow};
          overflow:hidden;background:${bgColor};
        ">
          <img src="${place.image_url}" width="${size}" height="${size}" style="display:block;border-radius:50%;object-fit:cover;" />
        </div>
        ${badgeHtml}
      </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      tooltipAnchor: [size / 2 + 6, 0],
    })
    iconCache.set(cacheKey, imgIcon)
    return imgIcon
  }

  const fallbackIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      border:${borderWidth}px solid ${borderColor};
      box-shadow:${shadow};
      background:${bgColor};
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;position:relative;
      will-change:transform;contain:layout style;
    ">
      ${categoryIconSvg(place.category_icon, isSelected ? 18 : 15)}
      ${badgeHtml}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2 + 6, 0],
  })
  iconCache.set(cacheKey, fallbackIcon)
  return fallbackIcon
}

// Small coloured pin for an OSM "explore" POI — distinct from the photo-circle
// markers of planned places; the colour matches its pill category.
const poiIconCache = new Map<string, L.DivIcon>()
function createPoiIcon(category: string) {
  const cached = poiIconCache.get(category)
  if (cached) return cached
  const cat = POI_CATEGORY_BY_KEY[category]
  const color = cat?.color || '#6b7280'
  const svg = cat ? renderToStaticMarkup(createElement(cat.Icon, { size: 13, color: 'white', strokeWidth: 2.5 })) : ''
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;">${svg}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    tooltipAnchor: [0, -14],
  })
  poiIconCache.set(category, icon)
  return icon
}

/**
 * Create a solid day-colored circle marker with the sequence number centred.
 * Used when the Day Colors toggle is active (T7-1f).
 */
function createDayColorIcon(dayIndex: number, orderNumber: number, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 44 : 36
  const color = getDayColor(dayIndex)
  const shadow = isSelected
    ? '0 0 0 3px rgba(17,24,39,0.25), 0 4px 14px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.22)'
  return L.divIcon({
    className: "",
    html: `<div style="\n      width:${size}px;height:${size}px;border-radius:50%;\n      background:${color};border:${isSelected ? 3 : 2.5}px solid white;\n      box-shadow:${shadow};display:flex;align-items:center;justify-content:center;\n      cursor:pointer;font-size:${isSelected ? 20 : 16}px;font-weight:800;color:white;\n      font-family:var(--font-system);line-height:1;\n    ">${orderNumber}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2 + 6, 0],
  })
}

// Clears the hover tooltip the moment the camera starts moving and suppresses
// re-showing it until the move ends: after a click-recenter the marker slides
// away under a stationary cursor, so the browser never fires mouseout — and
// mouseover/mousemove during the pan animation would immediately re-set the
// tooltip we just cleared (#1404).
function CameraHoverGuard({ movingRef, onMoveStart }: { movingRef: { current: boolean }; onMoveStart: () => void }) {
  const map = useMap()
  useEffect(() => {
    const start = () => { movingRef.current = true; onMoveStart() }
    const end = () => { movingRef.current = false }
    map.on('movestart zoomstart', start)
    map.on('moveend zoomend', end)
    return () => { map.off('movestart zoomstart', start); map.off('moveend zoomend', end) }
  }, [map, movingRef, onMoveStart])
  return null
}

// Emits the current viewport bbox on pan/zoom so the POI-explore pill can fetch
// OSM places for the visible area.
function ViewportController({ onViewportChange }: { onViewportChange?: (b: { south: number; west: number; north: number; east: number }) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!onViewportChange) return
    const emit = () => {
      const b = map.getBounds()
      onViewportChange({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
    }
    map.whenReady(emit) // ensure the first bbox is captured once the map is laid out
    map.on('moveend', emit)
    map.on('zoomend', emit)
    return () => { map.off('moveend', emit); map.off('zoomend', emit) }
  }, [map, onViewportChange])
  return null
}

interface SelectionControllerProps {
  places: Place[]
  selectedPlaceId: number | null
  dayPlaces: Place[]
  paddingOpts: L.FitBoundsOptions
}

function SelectionController({ places, selectedPlaceId, dayPlaces, paddingOpts }: SelectionControllerProps) {
  const map = useMap()
  const prev = useRef(null)

  useEffect(() => {
    if (selectedPlaceId && selectedPlaceId !== prev.current) {
      // Pan to the selected place without changing zoom. Offset the centre by the
      // side-panel + bottom-inspector padding so the pin lands in the middle of the
      // *visible* map area rather than the geometric centre (where the bottom panel
      // would cover it). Reuses the same paddingOpts the fit-bounds path uses.
      const selected = places.find(p => p.id === selectedPlaceId)
      if (selected?.lat != null && selected?.lng != null) {
        const latlng: [number, number] = [selected.lat, selected.lng]
        const tl = paddingOpts.paddingTopLeft as [number, number] | undefined
        const br = paddingOpts.paddingBottomRight as [number, number] | undefined
        if (tl && br && typeof map.project === 'function' && typeof map.unproject === 'function') {
          const point = map.project(latlng).add([(br[0] - tl[0]) / 2, (br[1] - tl[1]) / 2])
          map.panTo(map.unproject(point), { animate: true })
        } else {
          map.panTo(latlng, { animate: true })
        }
      }
    }
    prev.current = selectedPlaceId
  }, [selectedPlaceId, places, map])

  return null
}

interface MapControllerProps {
  center: [number, number]
  zoom: number
}

function MapController({ center, zoom }: MapControllerProps) {
  const map = useMap()
  const prevCenter = useRef(center)

  useEffect(() => {
    if (prevCenter.current[0] !== center[0] || prevCenter.current[1] !== center[1]) {
      map.setView(center, zoom)
      prevCenter.current = center
    }
  }, [center, zoom, map])

  return null
}

// Fit bounds when places change (fitKey triggers re-fit). On a day selection we
// fit to that day's destinations immediately, then — once the day's route has
// finished computing asynchronously — re-fit once more to include the full route
// polyline, so a route that bulges past its stops stays in view (#1128).
interface BoundsControllerProps {
  hasDayDetail?: boolean
  places: Place[]
  routeCoords: [number, number][]
  fitKey: number
  paddingOpts: L.FitBoundsOptions
}

function BoundsController({ places, routeCoords, fitKey, paddingOpts, hasDayDetail }: BoundsControllerProps) {
  const map = useMap()
  const prevFitKey = useRef(-1)
  const awaitingRoute = useRef(false)

  const fitTo = useCallback((coords: [number, number][]) => {
    if (coords.length === 0) return
    try {
      const bounds = L.latLngBounds(coords)
      if (bounds.isValid()) {
        map.fitBounds(bounds, { ...paddingOpts, maxZoom: 16, animate: true })
        if (hasDayDetail) {
          setTimeout(() => map.panBy([0, 150], { animate: true }), 300)
        }
      }
    } catch {}
  }, [map, paddingOpts, hasDayDetail])

  // New fitKey (initial trip fit or a day selection): fit to the destinations now
  // and arm a one-shot re-fit for when the route arrives.
  useEffect(() => {
    if (fitKey === prevFitKey.current) return
    prevFitKey.current = fitKey
    awaitingRoute.current = false
    if (places.length === 0) return
    fitTo(places.map(p => [p.lat, p.lng] as [number, number]))
    awaitingRoute.current = true
  }, [fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once the just-selected day's route is ready, expand the fit to include it.
  // One-shot per day-fit, so later route-profile toggles don't re-zoom the map.
  useEffect(() => {
    if (!awaitingRoute.current || routeCoords.length === 0) return
    awaitingRoute.current = false
    fitTo([...places.map(p => [p.lat, p.lng] as [number, number]), ...routeCoords])
  }, [routeCoords]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// ── Fit All Controller ──
// Zooms map to show ALL trip places (not just selected day)
function FitAllController({ allPlaces, fitAllKey, paddingOpts }: {
  allPlaces: Place[]
  fitAllKey: number
  paddingOpts: L.FitBoundsOptions
}) {
  const map = useMap()
  const prevFitAllKey = useRef(-1)

  useEffect(() => {
    if (fitAllKey === prevFitAllKey.current) return
    prevFitAllKey.current = fitAllKey
    const coords = allPlaces.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng] as [number, number])
    if (coords.length === 0) return
    try {
      const bounds = L.latLngBounds(coords)
      if (bounds.isValid()) {
        map.fitBounds(bounds, { ...paddingOpts, maxZoom: 16, animate: true })
      }
    } catch {}
  }, [fitAllKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

interface MapClickHandlerProps {
  onClick: ((e: L.LeafletMouseEvent) => void) | null
}

function ZoomTracker({ onZoomStart, onZoomEnd }: { onZoomStart: () => void; onZoomEnd: () => void }) {
  const map = useMap()
  useEffect(() => {
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    return () => { map.off('zoomstart', onZoomStart); map.off('zoomend', onZoomEnd) }
  }, [map, onZoomStart, onZoomEnd])
  return null
}

function MapClickHandler({ onClick }: MapClickHandlerProps) {
  const map = useMap()
  useEffect(() => {
    if (!onClick) return
    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [map, onClick])
  return null
}

function MapContextMenuHandler({ onContextMenu }: { onContextMenu: ((e: L.LeafletMouseEvent) => void) | null }) {
  const map = useMap()
  useEffect(() => {
    if (!onContextMenu) return
    map.on('contextmenu', onContextMenu)
    return () => { map.off('contextmenu', onContextMenu) }
  }, [map, onContextMenu])
  return null
}

// Travel times are shown in the day sidebar (per-segment connectors), not on the map.

// Module-level photo cache shared with PlaceAvatar
import { getCached, isLoading, fetchPhoto, onThumbReady, getAllThumbs } from '../../services/photoService'
import { useAuthStore } from '../../store/authStore'
import { useGeolocation } from '../../hooks/useGeolocation'
import LocationButton from './LocationButton'

// Live-location rendering inside the Leaflet map. Subscribes via the
// shared useGeolocation hook so the Leaflet and Mapbox variants behave
// identically. Heading is shown as a rotated conic SVG when available.
import type { GeoPosition, TrackingMode } from '../../hooks/useGeolocation'

function LeafletLocationLayer({ position, mode }: { position: GeoPosition | null; mode: TrackingMode }) {
  const map = useMap()

  // When the user is in follow mode, keep the map centred on the dot.
  // setView (no animation) is what Google Maps does during navigation —
  // it feels responsive and avoids animation jitter at walking speed.
  useEffect(() => {
    if (mode !== 'follow' || !position) return
    try { map.setView([position.lat, position.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.35 }) } catch { /* noop */ }
  }, [position, mode, map])

  // Once, when the user first acquires a fix in "show" mode, pan to it so
  // they don't have to scroll the map. Subsequent fixes only move the dot.
  const centeredRef = useRef(false)
  useEffect(() => {
    if (mode === 'off') { centeredRef.current = false; return }
    if (!position || centeredRef.current) return
    try { map.setView([position.lat, position.lng], Math.max(map.getZoom(), 15)) } catch { /* noop */ }
    centeredRef.current = true
  }, [position, mode, map])

  if (!position) return null

  const headingIcon = position.heading === null || Number.isNaN(position.heading) ? null : L.divIcon({
    className: '',
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    html: `<div style="
      width:60px;height:60px;
      transform:rotate(${position.heading}deg);transition:transform 120ms ease-out;
      background:conic-gradient(from -30deg, rgba(59,130,246,0) 0deg, rgba(59,130,246,0.35) 15deg, rgba(59,130,246,0) 60deg, rgba(59,130,246,0) 360deg);
      border-radius:50%;
      -webkit-mask:radial-gradient(circle, transparent 12px, black 13px);
      mask:radial-gradient(circle, transparent 12px, black 13px);
      pointer-events:none;
    "></div>`,
  })

  return (
    <>
      {position.accuracy < 500 && (
        <Circle
          center={[position.lat, position.lng]}
          radius={position.accuracy}
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1, opacity: 0.35 }}
          interactive={false}
        />
      )}
      {headingIcon && (
        <Marker
          position={[position.lat, position.lng]}
          icon={headingIcon}
          interactive={false}
          zIndexOffset={900}
        />
      )}
      <CircleMarker
        center={[position.lat, position.lng]}
        radius={8}
        pathOptions={{ color: 'white', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
        interactive={false}
      />
    </>
  )
}

interface MemoMarkerProps {
  place: any
  isSelected: boolean
  orderNumbers: number[] | null
  photoUrl: string | null
  onClickPlace: (id: number) => void
  onHover: (place: any, x: number, y: number) => void
  onHoverOut: () => void
  /** Day Colors toggle (T7-1f). */
  useDayColors?: boolean
  /** Array of { dayIndex, orderNumber } from placeDayMap — multi-day support. */
  dayInfo?: { dayIndex: number; orderNumber: number } | null
}

const MemoMarker = memo(function MemoMarker({
  place, isSelected, orderNumbers, photoUrl, onClickPlace, onHover, onHoverOut,
  useDayColors = false, dayInfo,
}: MemoMarkerProps) {
  // T7-1f: when Day Colors toggle is ON and the place has a day assignment,
  // render a solid coloured circle with the sequence number instead of the
  // photo / category icon.
  const useDayIcon = useDayColors && !!dayInfo
  const icon = useDayIcon
    ? createDayColorIcon(dayInfo.dayIndex, dayInfo.orderNumber, isSelected)
    : createPlaceIcon({ ...place, image_url: photoUrl }, orderNumbers, isSelected)
  return (
    <Marker
      position={[place.lat, place.lng]}
      icon={icon}
      eventHandlers={{
        click: () => onClickPlace(place.id),
        mouseover: (e: any) => onHover(place, e.originalEvent.clientX, e.originalEvent.clientY),
        mousemove: (e: any) => onHover(place, e.originalEvent.clientX, e.originalEvent.clientY),
        mouseout: onHoverOut,
      }}
      zIndexOffset={isSelected ? 1000 : 0}
    />
  )
})

export const MapView = memo(function MapView({
  places = [],
  dayPlaces = [],
  route = null,
  routeSegments = [],
  selectedPlaceId = null,
  hoverDisabled = false,
  onMarkerClick,
  onMapClick,
  onMapContextMenu = null,
  center = [48.8566, 2.3522],
  zoom = 10,
  tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  fitKey = 0,
  allPlaces = [],
  fitAllKey = 0,
  dayOrderMap = {},
  leftWidth = 0,
  rightWidth = 0,
  disableClustering = false,
  hasInspector = false,
  hasDayDetail = false,
  reservations = [] as Reservation[],
  showReservationStats = false,
  visibleConnectionIds = [] as number[],
  showTransitRoutes = true,
  onReservationClick,
  pois = [] as Poi[],
  onPoiClick,
  onViewportChange,
  placeDayMap = {},
  useDayColors = false,
  selectedDayIndex = null,
}: any) {

  // Per-day route color: use day palette when toggle ON + a day is selected;
  // otherwise fall back to the standard Apple blue (zero visual regression).
  const routeColor = useMemo(() => {
    if (useDayColors && selectedDayIndex !== null && selectedDayIndex >= 0) {
      return getDayColor(selectedDayIndex)
    }
    return '#0a84ff'
  }, [useDayColors, selectedDayIndex])

  // Casing color: same hue at reduced opacity for the wider underlay line.
  const casingOpacity = 0.75

  const poiMarkers = useMemo(() => (pois as Poi[]).map((poi: Poi) => (
    <Marker
      key={`poi-${poi.osm_id}`}
      position={[poi.lat, poi.lng]}
      icon={createPoiIcon(poi.category)}
      zIndexOffset={500}
      eventHandlers={{ click: () => onPoiClick?.(poi) }}
    >
      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="map-tooltip">{poi.name}</Tooltip>
    </Marker>
  )), [pois, onPoiClick])
  const visibleReservations = useMemo(() => {
    const set = new Set(visibleConnectionIds || [])
    // Transit journeys ride the route toggle — they are part of the computed
    // day route, so hiding the route hides them too (#1065).
    return reservations.filter((r: Reservation) => (r.type === 'transit' && showTransitRoutes) || set.has(r.id))
  }, [reservations, visibleConnectionIds, showTransitRoutes])
  // Real road geometry for car/bus/taxi/bicycle bookings (straight line until it loads/if it fails).
  const transportRoutes = useTransportRoutes(visibleReservations)
  // Dynamic padding: account for sidebars + bottom inspector + day detail panel
  const paddingOpts = useMemo((): L.FitBoundsOptions => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile) return { padding: [40, 20] }
    const top = 60
    const bottom = hasInspector ? 320 : hasDayDetail ? 280 : 60
    const left = leftWidth + 40
    const right = rightWidth + 40
    return { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] }
  }, [leftWidth, rightWidth, hasInspector, hasDayDetail])

  // Hover state for the single tooltip overlay (replaces per-marker <Tooltip>)
  const [hoveredPlace, setHoveredPlace] = useState<any>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const mapMovingRef = useRef(false)

  const handleMarkerHover = useCallback((place: any, x: number, y: number) => {
    if (hoverDisabled || mapMovingRef.current) return
    setHoveredPlace(place)
    setTooltipPos({ x, y })
  }, [hoverDisabled])

  const handleMarkerHoverOut = useCallback(() => {
    setHoveredPlace(null)
    setTooltipPos(null)
  }, [])

  // A marker's DOM node is replaced when it becomes selected (its icon grows
  // 36→44px, and the cluster group re-adds it), so the browser never fires
  // mouseout on the old node and the fixed-position hover tooltip gets orphaned
  // — it hangs on screen and drifts with page scroll. Drop it on any selection
  // change and on any scroll so it can never get stuck.
  useEffect(() => { setHoveredPlace(null); setTooltipPos(null) }, [selectedPlaceId])
  useEffect(() => {
    if (!hoveredPlace) return
    const clear = () => { setHoveredPlace(null); setTooltipPos(null) }
    window.addEventListener('scroll', clear, true)
    return () => window.removeEventListener('scroll', clear, true)
  }, [hoveredPlace])

  const handleMarkerClick = useCallback((id: number) => {
    // Clear the hover card right away: the recenter that follows moves the
    // marker out from under the cursor, so no mouseout will ever fire (#1404).
    setHoveredPlace(null)
    setTooltipPos(null)
    onMarkerClick?.(id)
  }, [onMarkerClick])

  const clearHover = useCallback(() => {
    setHoveredPlace(null)
    setTooltipPos(null)
  }, [])

  // photoUrls: only base64 thumbs for smooth map zoom
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(getAllThumbs)
  const placesPhotosEnabled = useAuthStore(s => s.placesPhotosEnabled)
  // Batch photo state updates through a RAF so N simultaneous photo loads
  // collapse into a single re-render instead of N separate renders.
  const pendingThumbsRef = useRef<Record<string, string>>({})
  const thumbRafRef = useRef<number | null>(null)

  const placeIds = useMemo(() => places.map(p => p.id).join(','), [places])
  // Normalize route data to a flat list of { segment: [coord..], dayIndex }.
  // Handles per-day routes ([seg][coords]), multi-day trip routes ([day][seg][coords]),
  // and edge cases where shape detection is ambiguous (T7-1g regression fix).
  const normalizedRouteSegments = useMemo<
    { segment: [number, number][]; dayIndex: number }[]
  >(() => {
    if (!route || route.length === 0) return []
    // Check depth: is this [day][seg][coords] (depth 3+) or [seg][coords] (depth 2)?
    // Heuristic: if route[0][0] exists and route[0][0][0] is a number, we're at
    // segment level directly. If route[0][0] is an array whose first element is ALSO
    // an array of numbers, we have one more nesting level.
    const first = route[0]
    if (!Array.isArray(first)) return []
    const firstSub = first[0]
    let depth3 = false
    if (Array.isArray(firstSub) && firstSub.length > 0 && Array.isArray(firstSub[0])) {
      // Could be [day][seg][coords] OR [seg][coords] where each "segment" is actually coords.
      // Distinguish: in [seg][coords], firstSub[0] = [lat, lng] (numbers).
      // In [day][seg][coords], firstSub[0] = [lat, lng] too — same shape!
      // But if route has >1 top-level element AND each sub-element also has >1 child,
      // it's more likely multi-day. However the safest approach: check if treating as
      // depth-3 produces valid segments.
      // Heuristic: if firstSub.length >= 2 && firstSub[0].length >= 2 (multiple coords per seg)
      // AND route.length matches expected day count pattern, treat as multi-day.
      // SAFEST FIX: try depth-3 first; if it yields zero valid segments, fall back to depth-2.
      const testDepth3 = route.flatMap((daySegs, di) =>
        Array.isArray(daySegs)
          ? (daySegs as [number, number][][]).flatMap(seg =>
              Array.isArray(seg) && seg.length >= 2 && typeof seg[0]?.[0] === 'number'
                ? [{ segment: seg as [number, number][], dayIndex: di }]
                : []
            )
          : []
      )
      if (testDepth3.length > 0) {
        depth3 = true
        return testDepth3
      }
    }
    // Depth-2 fallback (per-day route)
    const result = (route as [number, number][][]).flatMap(seg =>
      Array.isArray(seg) && seg.length >= 2 && typeof seg[0]?.[0] === 'number'
        ? [{ segment: seg as [number, number][], dayIndex: 0 }]
        : []
    )
    // Single-day routes have all segments at dayIndex 0; remap to the actual selected day
    // so per-day route lines use the correct color (Issue #2)
    if (result.length > 0 && result.every(s => s.dayIndex === 0) && selectedDayIndex !== null && selectedDayIndex >= 0) {
      result.forEach(s => { s.dayIndex = selectedDayIndex })
    }
    return result
  }, [route])

  // Flattened [lat,lng] points for bounds fitting (T7-1g regression fix).
  const routeCoords = useMemo<[number, number][]>
    (() => normalizedRouteSegments.flatMap(s => s.segment), [normalizedRouteSegments])
  useEffect(() => {
    if (!places || places.length === 0 || !placesPhotosEnabled) return
    const cleanups: (() => void)[] = []

    const setThumb = (cacheKey: string, thumb: string) => {
      pendingThumbsRef.current[cacheKey] = thumb
      if (thumbRafRef.current !== null) return
      thumbRafRef.current = requestAnimationFrame(() => {
        thumbRafRef.current = null
        const pending = pendingThumbsRef.current
        pendingThumbsRef.current = {}
        setPhotoUrls(prev => {
          const hasChange = Object.entries(pending).some(([k, v]) => prev[k] !== v)
          return hasChange ? { ...prev, ...pending } : prev
        })
      })
    }

    for (const place of places) {
      const cacheKey = place.google_place_id || place.osm_id || `${place.lat},${place.lng}`
      if (!cacheKey) continue

      const cached = getCached(cacheKey)
      if (cached?.thumbDataUrl) {
        setThumb(cacheKey, cached.thumbDataUrl)
        continue
      }

      cleanups.push(onThumbReady(cacheKey, thumb => setThumb(cacheKey, thumb)))

      if (!cached && !isLoading(cacheKey)) {
        const photoId =
          (place.image_url?.startsWith('/api/maps/place-photo/') ? place.image_url : null)
          || place.google_place_id
          || place.osm_id
          || place.image_url
        if (photoId || (place.lat && place.lng)) {
          fetchPhoto(cacheKey, photoId || `coords:${place.lat}:${place.lng}`, place.lat, place.lng, place.name)
        }
      }
    }

    return () => {
      cleanups.forEach(fn => fn())
      if (thumbRafRef.current !== null) {
        cancelAnimationFrame(thumbRafRef.current)
        thumbRafRef.current = null
      }
    }
  }, [placeIds, placesPhotosEnabled])

  const clusterIconCreateFunction = useCallback((cluster) => {
    const count = cluster.getChildCount()
    const size = count < 10 ? 36 : count < 50 ? 42 : 48
    return L.divIcon({
      html: `<div class="marker-cluster-custom" style="width:${size}px;height:${size}px;"><span>${count}</span></div>`,
      className: 'marker-cluster-wrapper',
      iconSize: L.point(size, size),
    })
  }, [])

  const isTouchDevice = typeof window !== 'undefined' && navigator.maxTouchPoints > 0

  const markers = useMemo(() => places.map((place) => {
    const isSelected = place.id === selectedPlaceId
    const pck = place.google_place_id || place.osm_id || `${place.lat},${place.lng}`
    const photoUrl = (pck && photoUrls[pck]) || place.image_url || null
    const orderNumbers = dayOrderMap[place.id] ?? null

    // T7-1f: resolve the day assignment for this place.
    // placeDayMap can hold a single {dayIndex,orderNumber} or an array (multi-day places).
    let dayInfo: { dayIndex: number; orderNumber: number } | null = null
    const raw = placeDayMap[place.id]
    if (raw) {
      if (Array.isArray(raw)) {
        // When a specific day is selected, use that assignment;
        // otherwise fall back to the earliest (first in array).
        dayInfo = selectedDayIndex !== null
          ? (raw.find((a: any) => a.dayIndex === selectedDayIndex) ?? raw[0]) || null
          : raw[0] || null
      } else {
        dayInfo = raw as { dayIndex: number; orderNumber: number }
      }
    }

    return (
      <MemoMarker
        key={place.id}
        place={place}
        isSelected={isSelected}
        orderNumbers={orderNumbers}
        photoUrl={photoUrl}
        onClickPlace={handleMarkerClick}
        onHover={handleMarkerHover}
        onHoverOut={handleMarkerHoverOut}
        useDayColors={useDayColors}
        dayInfo={dayInfo}
      />
    )
  }), [places, selectedPlaceId, dayOrderMap, photoUrls, handleMarkerClick,
       handleMarkerHover, handleMarkerHoverOut, placeDayMap, useDayColors, selectedDayIndex])

  const gpxPolylines = useMemo(() => places.flatMap(place => {
    if (!place.route_geometry) return []
    try {
      const coords = JSON.parse(place.route_geometry) as [number, number][]
      if (!coords || coords.length < 2) return []
      return [(
        <Polyline
          key={`gpx-${place.id}`}
          positions={coords}
          color={place.category_color || '#3b82f6'}
          weight={3.5}
          opacity={0.75}
        />
      )]
    } catch { return [] }
  }), [places])

  const TooltipOverlay = !hoverDisabled && hoveredPlace && tooltipPos && !isTouchDevice
  const CatIcon = TooltipOverlay ? getCategoryIcon(hoveredPlace.category_icon) : null

  const { position: userPosition, mode: trackingMode, error: trackingError, cycleMode: cycleTrackingMode } = useGeolocation()
  // Desktop browsers only get IP-based geolocation (city-level accuracy),
  // so the button would be misleading. Mobile, where real GPS lives, keeps it.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  // When the day-detail panel is open it slides up over the map (bottom: navh+20,
  // height var(--day-panel-h)) and covers the button's band, so lift the button
  // above it; otherwise keep the plain bottom-nav offset. #1348
  const locationButtonBottom = hasDayDetail
    ? 'calc(var(--bottom-nav-h, 84px) + 20px + var(--day-panel-h, 0px) + 12px)'
    : 'calc(var(--bottom-nav-h, 84px) + 12px)'

  return (
    <>
    <div className="w-full h-full relative">
    <MapContainer
      id="trek-map"
      center={center}
      zoom={zoom}
      zoomControl={false}
      className="w-full h-full bg-[#e5e7eb]"
    >
      <TileLayer
        url={tileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
        keepBuffer={8}
        updateWhenZooming={false}
        updateWhenIdle={true}
        referrerPolicy="strict-origin-when-cross-origin"
      />

      <MapController center={center} zoom={zoom} />
      <BoundsController places={dayPlaces.length > 0 ? dayPlaces : places} routeCoords={dayPlaces.length > 0 ? routeCoords : []} fitKey={fitKey} paddingOpts={paddingOpts} hasDayDetail={hasDayDetail} />
      <FitAllController allPlaces={allPlaces} fitAllKey={fitAllKey} paddingOpts={paddingOpts} />
      <SelectionController places={places} selectedPlaceId={selectedPlaceId} dayPlaces={dayPlaces} paddingOpts={paddingOpts} />
      <MapClickHandler onClick={onMapClick} />
      <MapContextMenuHandler onContextMenu={onMapContextMenu} />
      <CameraHoverGuard movingRef={mapMovingRef} onMoveStart={clearHover} />
      <ViewportController onViewportChange={onViewportChange} />
      <LeafletLocationLayer position={userPosition} mode={trackingMode} />

      {disableClustering ? markers : (
        <MarkerClusterGroup
          chunkedLoading
          chunkInterval={30}
          chunkDelay={0}
          maxClusterRadius={30}
          disableClusteringAtZoom={11}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          animate={false}
          iconCreateFunction={clusterIconCreateFunction}
        >
          {markers}
        </MarkerClusterGroup>
      )}

      {/* Apple-Maps style: casing under core, rounded.
         * T7-1e: per-day route color when Day Colors toggle ON + single day selected
         * T7-1g: multi-color trip routes — each day's segments in its own palette color
         * T7-1h fix: use normalizedRouteSegments to avoid shape detection crash
         */}
      {normalizedRouteSegments.length > 0 && normalizedRouteSegments.flatMap(
        ({ segment, dayIndex }, segIdx) => {
          const color = useDayColors ? getDayColor(dayIndex) : routeColor
          return [
            <Polyline
              key={`seg-${segIdx}-casing`}
              positions={segment}
              pathOptions={{
                color,
                weight: 8,
                opacity: casingOpacity,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />,
            <Polyline
              key={`seg-${segIdx}-core`}
              positions={segment}
              pathOptions={{
                color,
                weight: 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />,
          ]
        }
      )}

      {/* GPX imported route geometries */}
      {gpxPolylines}

      <ReservationOverlay
        reservations={visibleReservations}
        showConnections
        showStats={showReservationStats}
        onEndpointClick={onReservationClick}
        roadRoutes={transportRoutes}
      />

      {poiMarkers}
    </MapContainer>
    {isMobile && <LocationButton
      mode={trackingMode}
      error={trackingError}
      onClick={cycleTrackingMode}
      bottomOffset={locationButtonBottom as unknown as number}
    />}
    </div>

    {TooltipOverlay && (
      <div data-testid="tooltip" style={{
        position: 'fixed',
        left: tooltipPos.x + 14,
        top: tooltipPos.y - 10,
        zIndex: 9999,
        pointerEvents: 'none',
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        padding: '6px 10px',
        fontFamily: "var(--font-system)",
        maxWidth: 220,
        whiteSpace: 'nowrap',
      }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hoveredPlace.name}
        </div>
        {hoveredPlace.category_name && CatIcon && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
            <CatIcon size={10} style={{ color: hoveredPlace.category_color || '#6b7280', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>{hoveredPlace.category_name}</span>
          </div>
        )}
        {hoveredPlace.address && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hoveredPlace.address}
          </div>
        )}
      </div>
    )}
    </>
  )
})
