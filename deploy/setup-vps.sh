#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  OCL Maintenance — one-time VPS setup
#
#  Run this ONCE on a fresh Ubuntu 22.04 / 24.04 server, as root or with sudo:
#
#      sudo bash deploy/setup-vps.sh
#
#  It installs Docker, opens the firewall, and sets up DuckDNS so your server has
#  a free domain name and an automatic HTTPS certificate.
#  It is safe to run again if something fails part-way.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run as root:  sudo bash deploy/setup-vps.sh"

# ── 1. Docker ────────────────────────────────────────────────────────────────
log "Installing Docker (if not already present)"
if command -v docker >/dev/null 2>&1; then
  ok "Docker is already installed: $(docker --version)"
else
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ok "Docker installed: $(docker --version)"
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# ── 2. Firewall ──────────────────────────────────────────────────────────────
log "Configuring the firewall (SSH, HTTP, HTTPS)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp   >/dev/null 2>&1 || true
  ufw allow 80/tcp   >/dev/null 2>&1 || true
  ufw allow 443/tcp  >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "ufw: 22, 80 and 443 open"
else
  warn "ufw not found — make sure ports 80 and 443 are open in your provider's firewall"
fi

# ── 3. DuckDNS ───────────────────────────────────────────────────────────────
log "DuckDNS — a free domain name that keeps itself updated"
cat <<'GUIDE'

  You need a free DuckDNS subdomain so the server can have a proper HTTPS address.
  (Android refuses plain http:// connections, so this step is required.)

   1. Open  https://www.duckdns.org  and sign in (Google/GitHub login works)
   2. Create a subdomain, e.g.  ocl-plant   →  your address becomes
        ocl-plant.duckdns.org
   3. Copy the "token" shown at the top of the page
   4. Come back here and press Enter

GUIDE
read -rp "  Press Enter when you have your DuckDNS subdomain and token… " _

read -rp "  DuckDNS subdomain (the part before .duckdns.org): " DDNS_SUB
read -rsp "  DuckDNS token: " DDNS_TOKEN; echo
[ -n "$DDNS_SUB" ] || die "No subdomain given."
[ -n "$DDNS_TOKEN" ] || die "No token given."

DDNS_DOMAIN="${DDNS_SUB}.duckdns.org"

# Point the name at this server right away.
log "Pointing ${DDNS_DOMAIN} at this server"
curl -fsS "https://www.duckdns.org/update?domains=${DDNS_SUB}&token=${DDNS_TOKEN}&ip=" \
  | grep -qi '^OK' && ok "DuckDNS updated" || warn "DuckDNS update returned something unexpected — check the token"

# Keep it pointed here (home/office connections can change IP).
cat > /etc/systemd/system/duckdns.service <<UNIT
[Unit]
Description=DuckDNS updater for OCL Maintenance
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS "https://www.duckdns.org/update?domains=${DDNS_SUB}&token=${DDNS_TOKEN}&ip="
UNIT

cat > /etc/systemd/system/duckdns.timer <<'UNIT'
[Unit]
Description=Refresh the DuckDNS record every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now duckdns.timer >/dev/null 2>&1 || true
ok "DuckDNS refreshes every 5 minutes (systemctl status duckdns.timer)"

# ── 4. The .env file ─────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ -f .env ]; then
  warn ".env already exists — leaving it alone (delete it to start over)"
else
  log "Writing .env"
  JWT="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  read -rp "  Email address for certificate notices: " ACME_EMAIL
  read -rp "  Admin username [admin]: " ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-admin}"
  read -rsp "  Admin password (leave blank to auto-generate and print in the log): " ADMIN_PASS; echo

  cat > .env <<ENVFILE
DOMAIN=${DDNS_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
JWT_SECRET=${JWT}
TOKEN_TTL=30d
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
ENVFILE
  chmod 600 .env
  ok ".env written (permissions restricted to root)"
fi

# ── 5. Done ──────────────────────────────────────────────────────────────────
cat <<NEXT

═══════════════════════════════════════════════════════════════════════════════
 Setup complete.

 Next steps:

   1. Start the server:
        cd ${REPO_DIR}
        docker compose up -d --build

   2. Watch it come up (first run downloads images and gets the certificate,
      which usually takes 1–2 minutes):
        docker compose logs -f api

   3. Open your admin page:
        https://${DDNS_DOMAIN}

      Sign in with the admin username and the password you chose
      (or the generated one printed in the log above).

   4. Point the Android app at:
        https://${DDNS_DOMAIN}

═══════════════════════════════════════════════════════════════════════════════
NEXT
