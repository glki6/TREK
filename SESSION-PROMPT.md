# TREK Offline Nav — Session Prompt / Critical Info

## 🎯 Role: Overseer Only

**You are the overseer, NOT a builder or troubleshooter.**
- **Do NOT edit source files, build images, deploy containers, or run troubleshooting commands yourself.**
- **Do NOT fix issues directly — create cards and assign to subsagents.**
- Your job:
  1. Read this prompt on session start
  2. Check git status + workboard for current state
  3. Create Workboard cards with clear specs, including ALL constraints below
  4. Assign cards to subsagents
  5. Verify their results before marking complete
- **Include the ⚠️ Critical Constraints section in EVERY card that involves building or deploying.**

### Card Template Checklist (for build/deploy cards)
Always include:
- [ ] Source file(s) to edit + exact changes needed
- [ ] "Commit to git BEFORE rebuilding" — uncommitted changes won't bake into Docker layers
- [ ] Use named volumes `trek_trek-data` and `trek_trek-uploads` (NEVER bind mounts)
- [ ] Rebuild image: `docker build -t trek-offline-nav:latest .`
- [ ] Redeploy container with named volumes + verify health

## ⚠️ CRITICAL: Named Volumes Required (Include in Every Build Card)

**ALWAYS use Docker named volumes, NEVER bind mounts to `./data`:**

```bash
docker run -d \
    --name trek-trek \
    -p 3001:3000 \
    -e COOKIE_SECURE=false \
    -e ENCRYPTION_KEY="91db88…70de" \
    -e TZ=America/Toronto \
    -e LOG_LEVEL=info \
    -v trek_trek-data:/app/data \        # ✅ NAMED VOLUME (has admin creds + trip data)
    -v trek_trek-uploads:/app/uploads \  # ✅ NAMED VOLUME
    --restart unless-stopped \
    trek-offline-nav:latest              # Custom image, NOT mauriceboe/trek:latest
```

**NEVER use `-v ./data:/app/data` or `-v ./trek-data:/app/data`** — this creates a fresh empty database with no admin user and no trip data. The working data lives in the Docker named volume `trek_trek-data`.

### Why This Matters
- **Named volumes** (`trek_trek-data`) = persistent storage managed by Docker, contains:
  - SQLite DB (`travel.db`) with admin credentials + all trip/places data
  - Encryption key files, JWT secrets
  - Created Jul 6, survives container/image rebuilds
- **Bind mounts** (`./data:/app/data`) = mounts host directory, which is empty on first build → fresh DB with no users

### Verify Volumes Before Starting Container
```bash
# Check volumes exist and have data
docker volume inspect trek_trek-data trek_trek-uploads
ls -la /var/lib/docker/volumes/trek_trek-data/_data/  # Should show travel.db (~1.1MB)

# After container starts, verify mounts
docker inspect trek-trek --format '{{json .Mounts}}' | grep -q '"Type":"volume"' && echo "✅ Named volumes" || echo "❌ Bind mount — WRONG!"
```

## Build Checklist (After Source Changes)

When editing source files in `trek-custom/`, follow this sequence:

1. **Commit to git** — uncommitted changes won't be baked into Docker layers
   ```bash
   cd trek-custom && git add -A && git commit -m "T3-X: description"
   ```
2. **Rebuild image**
   ```bash
   docker build -t trek-offline-nav:latest .
   ```
3. **Redeploy with named volumes** (see above)
4. **Verify health**: `docker inspect trek-trek --format '{{.State.Health.Status}}'`

## Current State (2026-07-08 15:02 EDT)

### Completed Tasks
| Task | Description | Status |
|------|-------------|--------|
| T3-1 | Container swapped to custom image | ✅ |
| T3-2 | Data verified in named volumes | ✅ |
| T3-3 | Desktop tests passed | ✅ |
| T3-5 | Apple Maps → Google Maps search (native URI) | ✅ |
| T3-6 | Fallback + search fix | ✅ |
| T3-7 | Rebuild with correct code | ✅ |
| T3-8 | Place name search | ✅ |
| T3-9 | Coordinates+name for precise results | ✅ |
| T3-10 | PC fallback OSM → Google Maps web | ✅ (committed + rebuilt) |

### Remaining
| Task | Description | Status |
|------|-------------|--------|
| T3-4 | Offline test (airplane mode) ⭐ PRIMARY | ← NEXT |

## Access & Credentials

- **Tunnel URL:** `https://fur-assisted-supports-marvel.trycloudflare.com` (changes each session — check tunnel logs)
- **Admin login:** `admin@trek.local` / `TREKadmin2026`
- **Port:** 3001 → 3000 (container internal)
- **Tunnel command:** `~/bin/cloudflared tunnel --url http://localhost:3001 &`

## Known Issues

- Web UI login bug with special characters in passwords — use simple password (`TREKadmin2026`)
- Rate limiting after ~15 failed attempts — wait or restart container if locked out
- Tunnel uses HTTP/2 fallback (QUIC blocked) but works fine
