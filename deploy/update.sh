#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  OCL Maintenance — update a running server
#
#  Run on the VPS after pulling new code:
#      cd /opt/ocl-maintenance && bash deploy/update.sh
#
#  GitHub Actions runs exactly this on every push to main.
#  Safe to run repeatedly; it backs the database up before restarting.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
ok()  { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
warn(){ printf '\033[1;33m  ! %s\033[0m\n' "$1"; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

[ -f .env ] || { echo "✗ .env not found. Run deploy/setup-vps.sh first."; exit 1; }

DOCKER="docker"
docker compose version >/dev/null 2>&1 || DOCKER="docker-compose"

# ── 1. back up the database ──────────────────────────────────────────────────
# Cheap insurance: a copy per deploy, keeping the last 14.
log "Backing up the database"
mkdir -p backups
if [ -f data/ocl.db ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  # .backup is SQLite's safe hot-copy; fall back to cp if sqlite3 is absent.
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 data/ocl.db ".backup 'backups/ocl-${STAMP}.db'" && ok "backups/ocl-${STAMP}.db"
  else
    cp data/ocl.db "backups/ocl-${STAMP}.db" && ok "backups/ocl-${STAMP}.db"
  fi
  ls -1t backups/ocl-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
else
  warn "no database yet — nothing to back up"
fi

# ── 2. rebuild and restart ───────────────────────────────────────────────────
log "Building the new image"
$DOCKER compose build api

log "Restarting services"
$DOCKER compose up -d

# ── 3. wait for health ───────────────────────────────────────────────────────
log "Waiting for the API to report healthy"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    ok "API is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    warn "API did not become healthy in 30 seconds — recent logs:"
    $DOCKER compose logs --tail 40 api
    exit 1
  fi
  sleep 1
done

# ── 4. tidy up ───────────────────────────────────────────────────────────────
log "Cleaning up old images"
docker image prune -f >/dev/null 2>&1 || true

ok "Deploy complete"
$DOCKER compose ps
