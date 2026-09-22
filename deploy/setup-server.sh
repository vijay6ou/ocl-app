#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  OCL Maintenance — deployment setup for an EXISTING Ubuntu server
#
#  Written for a server that is already running other live services behind nginx.
#  It is ADDITIVE and idempotent: it installs Docker if missing, and writes the
#  .env file. It does NOT modify nginx, cloudflared, or any other service.
#
#      sudo bash deploy/setup-server.sh
#
#  After this, run:  docker compose up -d --build
#  Then add the nginx site:  sudo bash deploy/install-nginx-site.sh <your-domain>
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
ok()  { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
warn(){ printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run with sudo."

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# ── 1. Docker ────────────────────────────────────────────────────────────────
log "Checking Docker"
if command -v docker >/dev/null 2>&1; then
  ok "already installed: $(docker --version)"
else
  warn "not installed — installing"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  SUITE=""
  for TRY in "$CODENAME" noble jammy; do
    if curl -fsS -o /dev/null "https://download.docker.com/linux/ubuntu/dists/$TRY/Release" 2>/dev/null; then
      SUITE="$TRY"; break
    fi
  done
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${SUITE:-$CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker >/dev/null 2>&1 || true
  ok "installed: $(docker --version)"
fi

# ── 2. .env ──────────────────────────────────────────────────────────────────
log "Configuring .env"
if [ -f .env ] && grep -q '^JWT_SECRET=.\+' .env; then
  ok ".env already configured — leaving it alone"
else
  if [ -f .env ]; then
    warn ".env exists but has no JWT_SECRET — filling it in"
  fi
  JWT="$(openssl rand -hex 32)"
  read -rp "  Admin username [admin]: " ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-admin}"
  read -rsp "  Admin password (blank = generate one and print it in the log): " ADMIN_PASS; echo

  cat > .env <<ENVFILE
JWT_SECRET=${JWT}
TOKEN_TTL=30d
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
ENVFILE
  chmod 600 .env
  ok ".env written and restricted to root"
fi

# ── 3. firewall note ─────────────────────────────────────────────────────────
log "Firewall check"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  warn "ufw is active — ports 80 and 443 must already be open for the existing nginx"
  ufw status | head -12
else
  ok "ufw inactive (this server relies on Oracle's cloud firewall rules)"
fi

# ── 4. summary ───────────────────────────────────────────────────────────────
ARCH="$(uname -m)"
cat <<NEXT

═══════════════════════════════════════════════════════════════════════════════
 Setup done.  Architecture: ${ARCH}

 Next:

   1. Build and start the API (it listens on 127.0.0.1:3100 only):
        cd ${REPO_DIR}
        docker compose up -d --build

   2. Watch it start and note the admin password if one was generated:
        docker compose logs -f api

   3. Check it is up:
        curl -s http://127.0.0.1:3100/healthz

   4. Put it on the internet with HTTPS (needs a DNS name pointing here):
        sudo bash deploy/install-nginx-site.sh <your-domain>

═══════════════════════════════════════════════════════════════════════════════
NEXT
