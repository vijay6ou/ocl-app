#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  OCL Maintenance — update a running deployment
#
#  Run on the server as root (the ubuntu user is not in the docker group here):
#
#      cd /opt/ocl-maintenance
#      git pull origin main
#      sudo bash deploy/update.sh
#
#  Safe to run repeatedly. Backs the database up before restarting and waits for
#  the API to report healthy, so a broken deploy is obvious immediately.
#
#  NOTE: this deployment deliberately does NOT touch nginx or any other service
#  on the host. It only rebuilds and restarts the ocl api container.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
ok()  { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
warn(){ printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo:  sudo bash deploy/update.sh"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

[ -f .env ] || die ".env not found. Copy deploy/.env.example to .env and set JWT_SECRET."
grep -q '^JWT_SECRET=.\+' .env || die "JWT_SECRET is empty in .env"

# Work with either docker compose syntax.
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

# ── 1. back up the database ──────────────────────────────────────────────────
# Every step is deliberately non-fatal: a failed backup must never stop a deploy,
# and on a first run there may be nothing to back up yet.
#
# The snapshot uses SQLite's backup API inside the container. Copying ocl.db on
# its own is NOT safe here: the database runs in WAL mode, so committed rows can
# live in ocl.db-wal while ocl.db holds only a few kilobytes of empty schema.
log "Backing up the database"
mkdir -p backups || true
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKED_UP=0
CID="$($DC ps -q api 2>/dev/null || true)"
if [ -n "$CID" ]; then
  if $DC exec -T api node src/db.js backup /data/backup-snapshot.db >/dev/null 2>&1; then
    if docker cp "${CID}:/data/backup-snapshot.db" "backups/ocl-${STAMP}.db" >/dev/null 2>&1; then
      SIZE="$(stat -c%s "backups/ocl-${STAMP}.db" 2>/dev/null || echo 0)"
      ok "backups/ocl-${STAMP}.db (${SIZE} bytes)"
      BACKED_UP=1
    fi
    $DC exec -T api rm -f /data/backup-snapshot.db >/dev/null 2>&1 || true
  fi
fi
[ "$BACKED_UP" -eq 1 ] || warn "no backup taken (container not running, or no database yet)"

# Keep the 14 most recent; never let an empty directory abort the script.
if ls -1t backups/ocl-*.db >/dev/null 2>&1; then
  ls -1t backups/ocl-*.db | tail -n +15 | xargs -r rm -f || true
fi

# ── 2. rebuild and restart ───────────────────────────────────────────────────
log "Building the new image"
$DC build api

log "Restarting"
$DC up -d

# ── 3. wait for health ───────────────────────────────────────────────────────
log "Waiting for the API to report healthy"
HEALTHY=0
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3100/healthz >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 2
done
if [ "$HEALTHY" -eq 1 ]; then
  ok "API is healthy on 127.0.0.1:3100"
else
  warn "API did not become healthy in 120s — last 40 log lines:"
  $DC logs --tail 40 api
  exit 1
fi

# ── 4. confirm we did not disturb anything else ──────────────────────────────
log "Confirming other services are untouched"
for s in nginx cloudflared archive fleet-dashboard; do
  printf '  %-18s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || echo 'n/a')"
done

log "Cleaning up old images"
docker image prune -f >/dev/null 2>&1 || true

ok "Deploy complete"
$DC ps
