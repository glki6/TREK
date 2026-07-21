# T0-4: Lighter-Weight Override Investigation

**Date:** 2026-07-07  
**Conclusion:** Full Docker image rebuild is required. No runtime override mechanism exists.

## What Was Checked

### 1. Environment Variables
- **Client code:** Zero `process.env` or `import.meta.env` references across all `.ts`/`.tsx` files
- **Server env vars:** Cover API keys, OIDC, backups, Unsplash, Overpass endpoints — nothing about navigation URL format or map provider
- **Result:** No env var can control which navigation provider is used

### 2. Mountable Asset Paths
- Dockerfile copies client build output (`client/dist`) to `/app/server/public` at build time (Stage 4)
- README explicitly warns: mount ONLY `/app/data` and `/app/uploads`
- Mounting anything else hides application code and causes container startup failure
- **Result:** Cannot override frontend assets via volume mount

### 3. Server-Side URL Generation
- Navigation URLs are generated purely client-side:
  - `client/src/components/Planner/placeGoogleMaps.ts` → `getGoogleMapsUrlForPlace()` — constructs `https://www.google.com/maps/...` URLs
  - `client/src/components/Map/RouteCalculator.ts` → `generateGoogleMapsUrl()` — constructs `https://www.google.com/maps/dir/...` URLs
  - `client/src/components/Planner/placeOpenStreetMap.ts` → `getOpenStreetMapUrlForPlace()` — constructs `https://www.openstreetmap.org/...` URLs
- Server does NOT generate or proxy navigation URLs
- **Result:** No server-side hook to intercept or rewrite navigation URLs

### 4. Customization Documentation
- CONTRIBUTING.md: No mention of plugins, hooks, or customization extensions
- README customization section: Covers only units, map tile sources, default coordinates
- **Result:** No documented customization path

## Why Full Rebuild Is Required

1. **Client is baked in at build time** — Vite builds the React SPA into static JS/CSS, copied into the Docker image
2. **No runtime config injection** — the built client has no mechanism to read env vars or config files
3. **No plugin system** — TREK has no extension points for modifying URL generation behavior
4. **No server-side URL generation** — navigation URLs are client-side string construction, not server API responses

## Files That Need Editing (for Phase 1)

| File | Function | Purpose |
|------|----------|---------|
| `client/src/components/Planner/placeGoogleMaps.ts` | `getGoogleMapsUrlForPlace()` | Place card Google Maps button |
| `client/src/components/Map/RouteCalculator.ts` | `generateGoogleMapsUrl()` | Trip route directions button |
| `client/src/components/Planner/placeOpenStreetMap.ts` | `getOpenStreetMapUrlForPlace()` | Place card OSM button |

These 3 files contain hardcoded `https://www.google.com/maps/...` and `https://www.openstreetmap.org/...` URLs that need to be replaced with native URI schemes (`comgooglemaps://`, `maps://`).
