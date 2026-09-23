#!/usr/bin/env bash
# Deploy the plant log from git to the running service.
#
#   cd /opt/ocl-technician-log
#   sudo bash deploy/update.sh
#
# Must run as root: it restarts a systemd service.
#
# Safety: the current build is moved aside before rebuilding. If the build or
# the health check fails, the previous build is restored and the service is put
# back, so a bad commit does not take the plant log down.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="ocl-technician-log"
HEALTH="http://127.0.0.1:43127/api/health"
KEEP_BUILDS=3

log()  { printf '\n=== %s\n' "$*"; }
fail() { printf '\n!!! %s\n' "$*" >&2; }

if [[ $EUID -ne 0 ]]; then
  fail "Run with sudo:  sudo bash deploy/update.sh"
  exit 1
fi

run_as_owner() {
  # Keep node_modules and .next owned by the service user.
  local owner
  owner="$(stat -c '%U' "$APP_DIR")"
  sudo -u "$owner" --preserve-env=PATH,HOME,NODE_ENV "$@"
}

wait_for_health() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

cd "$APP_DIR"

log "Fetching latest"
run_as_owner git pull --ff-only origin main

# devDependencies are required to BUILD (Tailwind runs as a PostCSS plugin and
# Next type-checks with TypeScript). Installing with NODE_ENV=production omits
# them and the build then fails — which is exactly how an earlier deploy of this
# service ended up running a build it could not reproduce.
log "Installing dependencies (including dev — the build needs them)"
export NODE_ENV=development
if [[ -f package-lock.json ]]; then
  run_as_owner npm ci --include=dev --no-audit --no-fund
else
  run_as_owner npm install --include=dev --no-audit --no-fund
fi

log "Pre-flight: build prerequisites"
MISSING=()
for dep in next tailwindcss @tailwindcss/postcss typescript; do
  [[ -d "node_modules/$dep" ]] || MISSING+=("$dep")
done
[[ -x node_modules/.bin/next ]] || MISSING+=("node_modules/.bin/next")
if (( ${#MISSING[@]} )); then
  fail "Missing build dependencies: ${MISSING[*]}"
  fail "The running service was NOT touched — it is still serving the last good build."
  exit 1
fi
printf '  ok — next, tailwind, typescript present\n'

log "Stashing the current build for rollback"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK=""
if [[ -d .next ]]; then
  ROLLBACK=".next.previous-$STAMP"
  mv .next "$ROLLBACK"
fi

restore_previous_build() {
  fail "$1 — restoring the previous build"
  if [[ -n "$ROLLBACK" && -d "$ROLLBACK" ]]; then
    rm -rf .next
    mv "$ROLLBACK" .next
    systemctl restart "$SERVICE" || true
    if wait_for_health; then
      fail "Rolled back. The plant log is serving the previous build."
    else
      fail "Rollback did NOT come up. Check: journalctl -u $SERVICE -n 100"
    fi
  else
    fail "No previous build to restore. Check: journalctl -u $SERVICE -n 100"
  fi
  exit 1
}

# Never leave the service pointing at a directory that is mid-build.
systemctl stop "$SERVICE" || true

log "Building"
if ! run_as_owner npm run build; then
  restore_previous_build "Build failed"
fi

log "Restarting $SERVICE"
systemctl start "$SERVICE"

if ! wait_for_health; then
  restore_previous_build "Service did not become healthy"
fi

log "Healthy"
curl -fsS --max-time 5 "$HEALTH"; echo

log "Pruning old builds (keeping $KEEP_BUILDS)"
mapfile -t OLD < <(ls -1dt .next.previous-* 2>/dev/null | tail -n +$((KEEP_BUILDS + 1)) || true)
if (( ${#OLD[@]} )); then
  printf '  removing %s\n' "${OLD[@]}"
  rm -rf "${OLD[@]}"
fi

log "Reloading nginx (configuration may reference this service)"
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
  printf '  nginx reloaded\n'
else
  fail "nginx config invalid — NOT reloading. Run: nginx -t"
fi

log "Verifying the public endpoints"
printf '  https://ocl.vishryfarms.com      -> %s\n' \
  "$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 https://ocl.vishryfarms.com/api/health || echo FAIL)"
printf '  http://158.101.199.190 (phones)  -> %s\n' \
  "$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 http://158.101.199.190/days || echo FAIL)"

log "Done. Deployed $(git rev-parse --short HEAD)"
