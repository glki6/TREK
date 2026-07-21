# TREK Dockerfile Build Analysis

**Date:** 2026-07-07
**TREK version:** 3.2.1
**Dockerfile:** repo root `/Dockerfile`

## Build Stages

### Stage 0: `gosu-build` (golang:1.25-alpine)
- Builds gosu binary from source using Go toolchain
- Purpose: avoid stale Go stdlib in Debian's apt gosu (trips CVE scanners)
- Output: single `/usr/local/bin/gosu` binary
- Used in runtime to drop privileges from root to `node` user

### Stage 1: `shared-builder` (node:24-alpine)
- Installs `@trek/shared` workspace deps via `npm ci --workspace=shared`
- Builds shared package via `npm run build --workspace=shared` (uses `tsdown`)
- Output: `/app/shared/dist/` (CJS + ESM + type declarations)
- Shared package: Zod schemas + i18n translations, single source of truth

### Stage 2: `client-builder` (node:24-alpine)
- Installs `@trek/client` workspace deps via `npm ci --workspace=client`
- Copies shared/dist from stage 1
- Prebuild: `node scripts/generate-icons.mjs`
- Builds via `npm run build --workspace=client` (Vite 8.1 + React 19.2.6)
- Output: `/app/client/dist/` (static SPA assets) + `/app/client/public/fonts/`

### Stage 3: `server-builder` (node:24-alpine)
- Installs `@trek/server` workspace deps via `npm ci --workspace=server --ignore-scripts`
  - `--ignore-scripts` skips better-sqlite3 native build (done in production stage instead)
- Copies shared/dist from stage 1
- Builds via `npm run build --workspace=server` (custom `scripts/build.mjs` → `tsc -p tsconfig.build.json`)
- Output: `/app/server/dist/` + `/app/server/assets/` (airports.json, atlas/*.geojson.gz)

### Stage 4: Production Runtime (node:24-trixie-slim)
- **Base:** Debian Trixie slim (NOT Alpine — switched from build stages)
- **System deps installed then cleaned:**
  - tzdata, dumb-init, wget, ca-certificates (kept)
  - python3, build-essential (installed for better-sqlite3 native compilation, then purged)
  - libkitinerary-bin (flight itinerary PDF parsing)
- **npm ci --omit=dev** — production deps only, triggers better-sqlite3 native build
- **Copies from build stages:**
  - gosu binary (stage 0)
  - server/dist, server/assets (stage 3)
  - shared/dist (stage 1)
  - client/dist → server/public (stage 2) — **frontend baked into server**
  - client/public/fonts → server/public/fonts
- **Runtime scripts:** server/tsconfig.json, migrate-encryption.ts, reset-admin.js
- **Directory structure:** data/logs, uploads/{files,covers,avatars,photos}
- **Ownership:** all files chown'd to node:node
- **Health check:** `wget -qO- http://localhost:3000/api/health`
- **Entry point:** dumb-init → preflight check → gosu node → Node.js server

## Key Architecture Insights

### Client is Baked In
The client build output is copied to `/app/server/public` in the final image. This means:
- **Any frontend change requires a full image rebuild** — no hot-reload or volume mount for production
- The server serves the SPA statically from `/public`
- No separate frontend container or nginx reverse proxy

### Workspace Structure
```
trek-custom/
├── package.json          # root workspace config (@trek/root)
├── package-lock.json     # deterministic lockfile
├── Dockerfile            # multi-stage build
├── client/               # Vite + React 19 SPA
├── server/               # NestJS 11 API + static file server
└── shared/               # Zod schemas + i18n (tsdown)
```

### .dockerignore
Excludes: node_modules, dist, test files, .env files, docs, wiki, coverage, IDE files
This keeps the build context lean (~50-100 MB instead of GBs).

## Build Commands

### Full Build (first time)
```bash
cd trek-custom/
docker build -t trek-offline-nav:latest .
```

### Rebuild After Frontend Change
```bash
cd trek-custom/
docker build --no-cache -t trek-offline-nav:latest .
# OR with layer cache (faster if only client changed):
docker build -t trek-offline-nav:latest .
```

### Build with Custom Tag
```bash
docker build --build-arg APP_VERSION=3.2.1-offline-nav -t trek-offline-nav:3.2.1 .
```

## Build Time Estimates (9800X3D, 32GB RAM, WSL2)

| Scenario | Estimated Time |
|----------|---------------|
| First build (cold cache) | 15–30 minutes |
| Rebuild with layer cache | 5–15 minutes |
| Client-only change (cache hits on server stages) | 3–8 minutes |
| `--no-cache` full rebuild | 15–30 minutes |

**Bottlenecks:**
1. Initial image downloads (~2 GB total: golang:1.25-alpine, node:24-alpine, node:24-trixie-slim)
2. `npm ci` across 3 workspaces (~1000+ packages)
3. Vite client build (TypeScript compilation + bundling + code splitting)
4. better-sqlite3 native compilation (C++ addon via node-gyp)
5. apt-get install in production stage

**Why it should be fast on this hardware:**
- 9800X3D: 12 cores, excellent single-thread (Vite/tsc are largely single-threaded)
- 32GB RAM: plenty for npm ci + Vite build (typically peaks at 2-4 GB)
- WSL2: Docker Desktop uses Windows containerd, I/O is the main concern
- SSD storage: layer caching should be effective

## Build Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| better-sqlite3 native compilation fails | Low | build-essential + python3 installed in stage 4 |
| Out of memory during Vite build | Very low | 32GB RAM, Vite typically uses <4GB |
| Network interruption during layer downloads | Medium | Docker retries; can resume with `docker build` |
| Layer cache invalidation causes full rebuild | Medium | Use `--cache-from` if needed |
| golang:1.25-alpine image unavailable | Very low | Official Go image, highly available |
| node:24-trixie-slim unavailable | Very low | Official Node image, highly available |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| NODE_ENV | Runtime mode | production |
| PORT | HTTP port | 3000 |
| APP_VERSION | Version label | dev (set via --build-arg) |
| XDG_CACHE_HOME | Kitinerary cache | /tmp/kf6-cache |
| QT_QPA_PLATFORM | Qt display mode | offscreen (headless) |
| KITINERARY_EXTRACTOR_PATH | Flight extractor binary | /usr/local/bin/kitinerary-extractor |

## Security Features

- `gosu` for privilege drop (root → node user)
- `dumb-init` for proper PID 1 signal handling
- Read-only filesystem (configured in docker-compose.yml)
- `no-new-privileges` security option
- Minimal capabilities (CHOWN, SETUID, SETGID only)
- tmpfs for /tmp (noexec, nosuid, 128MB limit)
- Preflight check in CMD: fails with actionable message if app files are missing

## Notes for Custom Image Build

1. **Only the client stage needs to change** for our offline navigation fix
2. Docker layer caching should skip stages 0, 1, 3, 4 if only client source changed
3. The `.dockerignore` already excludes test files and docs, keeping context lean
4. No host-side Node.js, npm, or system dependencies needed — Docker handles everything
5. After build, test with `docker run --rm -p 3002:3000 trek-offline-nav:latest` before swapping containers
