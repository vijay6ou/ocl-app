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

# Resolve the app directory before any re-exec, and pass it down: after the
# re-exec below, BASH_SOURCE points at a temp file and the path would be wrong.
if [[ -z "${OCL_APP_DIR:-}" ]]; then
  OCL_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  export OCL_APP_DIR
fi
APP_DIR="$OCL_APP_DIR"

# Re-exec from a snapshot of this script.
#
# This file lives in the repo, and the deploy pulls the repo — so without this,
# `git pull` rewrites update.sh while bash is still reading it, and bash
# resumes at the old byte offset inside the new file. That produced a mangled
# run that ignored its own fixes. Running from a temp copy makes the deploy
# immune to changing itself mid-flight.
if [[ "${OCL_DEPLOY_SNAPSHOT:-0}" != "1" ]]; then
  SNAPSHOT="$(mktemp /tmp/ocl-update-XXXXXX.sh)"
  cp "${BASH_SOURCE[0]}" "$SNAPSHOT"
  export OCL_DEPLOY_SNAPSHOT=1
  exec bash "$SNAPSHOT" "$@"
fi

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
  #
  # HOME must be set explicitly: this script runs as root, so an inherited HOME
  # is /root, and npm run as the owner would try to use /root/.npm as its cache
  # and die with EACCES (git would also warn about unreadable /root/.config/git).
  local owner owner_home
  owner="$(stat -c '%U' "$APP_DIR")"
  owner_home="$(getent passwd "$owner" | cut -d: -f6)"
  [[ -n "$owner_home" ]] || owner_home="/home/$owner"
  # NODE_ENV is deliberately NOT set here. Forcing NODE_ENV=development to make
  # npm install devDependencies also leaks into `next build`, and a build run
  # with a non-standard NODE_ENV makes Turbopack emit broken CSS — it fails with
  # "Parsing CSS source code failed" on generated selectors that do not exist in
  # any source file. `--include=dev` on the install is the correct lever.
  sudo -u "$owner" env \
    HOME="$owner_home" \
    PATH="$PATH" \
    npm_config_cache="$owner_home/.npm" \
    "$@"
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
INSTALL_OK=1
if [[ -f package-lock.json ]]; then
  run_as_owner npm ci --include=dev --no-audit --no-fund || INSTALL_OK=0
else
  run_as_owner npm install --include=dev --no-audit --no-fund || INSTALL_OK=0
fi
if (( INSTALL_OK == 0 )); then
  fail "Dependency install failed. The running service was NOT touched — it is"
  fail "still serving the last good build."
  exit 1
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
# Pin NODE_ENV=production explicitly: a build under any other value makes
# Turbopack emit broken CSS (see the note on run_as_owner).
if ! run_as_owner env NODE_ENV=production npm run build; then
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
