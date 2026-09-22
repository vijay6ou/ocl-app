#!/usr/bin/env bash
# Publish OCL Maintenance at a domain through the EXISTING nginx, with HTTPS.
#
# Two-phase on purpose: nginx is configured for HTTP first so the certificate
# challenge can succeed, then HTTPS is added. The config is always validated
# before a reload and rolled back automatically if validation fails, so the
# other sites on this server cannot be broken by this script.
#
#   sudo bash deploy/install-nginx-site.sh ocl.vishryfarms.com
set -uo pipefail

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || die "Usage: sudo bash deploy/install-nginx-site.sh <domain>"

UPSTREAM="127.0.0.1:3100"
SITE=/etc/nginx/sites-available/ocl-maintenance
ENABLED=/etc/nginx/sites-enabled/ocl-maintenance
WEBROOT=/var/www/html

BACKUP=/tmp/nginx-site-backup.$$
[ -f "$SITE" ] && cp "$SITE" "$BACKUP" || true

restore() {
  warn "rolling back the nginx change"
  if [ -f "$BACKUP" ]; then cp "$BACKUP" "$SITE"; else rm -f "$SITE" "$ENABLED"; fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  rm -f "$BACKUP"
}

# Validate using nginx's EXIT CODE, not by matching its output text. nginx -t
# writes to stderr, and grepping it proved unreliable on this server.
nginx_ok() { nginx -t >/dev/null 2>&1; }

# `systemctl reload nginx` returns before the workers have swapped configs, so
# polling immediately can hit a worker still running the OLD config. That caused
# a false rollback the first time this ran. Poll until the URL behaves as wanted.
wait_for_http() {
  _url="$1"; _want="$2"; _tries="${3:-40}"; _i=0
  while [ "$_i" -lt "$_tries" ]; do
    _code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$_url" 2>/dev/null || echo 000)"
    [ "$_code" = "$_want" ] && return 0
    _i=$((_i + 1))
    sleep 0.5
  done
  return 1
}

# ── 0. upstream must answer ──────────────────────────────────────────────────
log "Checking the API on ${UPSTREAM}"
curl -fsS -m 5 "http://${UPSTREAM}/healthz" >/dev/null 2>&1 \
  && ok "API healthy" \
  || die "Nothing on ${UPSTREAM}. Run: cd /opt/ocl-maintenance && sudo docker compose up -d"

# ── 0b. DNS must point here ──────────────────────────────────────────────────
log "Checking DNS for ${DOMAIN}"
MYIP="$(curl -s -m 6 https://api.ipify.org || echo '')"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || echo '')"
echo "  this server : ${MYIP:-unknown}"
echo "  ${DOMAIN} -> ${RESOLVED:-nothing}"
[ -n "$RESOLVED" ] || die "That name does not resolve yet."
if [ -n "$MYIP" ] && [ "$RESOLVED" != "$MYIP" ]; then
  warn "Name resolves to ${RESOLVED}, not ${MYIP} — expected if Cloudflare proxies it."
fi

# ── 1. PHASE ONE: HTTP only, so the ACME challenge can be served ─────────────
log "Phase 1 — HTTP config"
cat > "$SITE" <<HTTP_ONLY
# OCL Maintenance API + admin page.
# Added by deploy/install-nginx-site.sh — separate from every other site here.
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }

    location / {
        proxy_pass http://${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 200m;
        proxy_read_timeout 90s;
        proxy_request_buffering off;
    }
}
HTTP_ONLY

[ -L "$ENABLED" ] || ln -s "$SITE" "$ENABLED"

if ! nginx_ok; then
  nginx -t 2>&1 || true; restore; die "Config invalid — rolled back; nothing else affected."
fi
ok "config valid"

systemctl reload nginx || { restore; die "nginx reload failed — rolled back."; }
ok "nginx reloaded (HTTP only)"

# ── 2. prove the challenge path is reachable over the real hostname ──────────
# Reload returns before workers swap configs, so poll rather than testing once.
log "Proving the certificate challenge path works"
mkdir -p "${WEBROOT}/.well-known/acme-challenge"
TOKENFILE="acl-test-$$"
echo "reachable" > "${WEBROOT}/.well-known/acme-challenge/${TOKENFILE}"
GOT=""
for i in $(seq 1 20); do
  GOT="$(curl -s -m 10 "http://${DOMAIN}/.well-known/acme-challenge/${TOKENFILE}" || echo '')"
  [ "$GOT" = "reachable" ] && break
  sleep 1
done
rm -f "${WEBROOT}/.well-known/acme-challenge/${TOKENFILE}"
if [ "$GOT" = "reachable" ]; then
  ok "challenge path reachable over http://${DOMAIN}"
else
  warn "challenge path returned '${GOT}' instead of the test file — certbot may still succeed"
fi

# ── 3. certificate ───────────────────────────────────────────────────────────
log "Obtaining the certificate"
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  ok "certificate already present"
else
  command -v certbot >/dev/null 2>&1 || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot; }
  if certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
       --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring; then
    ok "certificate issued"
  else
    warn "certbot failed — the site stays on HTTP. Other sites are unaffected."
    warn "Re-run this script once DNS/port 80 is correct; it is safe to repeat."
    exit 1
  fi
fi

# ── 4. PHASE TWO: add HTTPS ──────────────────────────────────────────────────
log "Phase 2 — HTTPS config"
cat > "$SITE" <<WITH_TLS
# OCL Maintenance API + admin page.
# Added by deploy/install-nginx-site.sh — separate from every other site here.
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:OCL:5m;

    client_max_body_size 200m;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
        proxy_request_buffering off;
    }
}
WITH_TLS

if ! nginx_ok; then
  nginx -t 2>&1 || true; restore; die "HTTPS config invalid — rolled back."
fi
ok "config valid"

systemctl reload nginx || { restore; die "reload failed — rolled back."; }
ok "nginx reloaded (HTTPS enabled)"
rm -f "$BACKUP"

# ── 5. verify end to end (poll: reload is asynchronous) ──────────────────────
log "Verifying https://${DOMAIN}"
wait_for_http "https://${DOMAIN}/healthz" "200" 40 \
  && ok "https reachable" \
  || warn "https did not return 200 within 20s — check 'nginx -t' and the container"
echo "  healthz  : $(curl -s -o /dev/null -w '%{http_code}' -m 15 https://${DOMAIN}/healthz)"
echo "  admin    : $(curl -s -o /dev/null -w '%{http_code}' -m 15 https://${DOMAIN}/)"
echo "  http-->  : $(curl -s -o /dev/null -w '%{http_code}' -m 15 http://${DOMAIN}/) (expect 301)"
echo "  body     : $(curl -s -m 15 https://${DOMAIN}/healthz)"

log "Confirming the other services are untouched"
for s in nginx cloudflared archive fleet-dashboard; do
  printf '  %-18s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || echo n/a)"
done
echo "  port 80 owner: $(ss -tlnp | grep ':80 ' | grep -o 'nginx' | head -1)"

cat <<NEXT

═══════════════════════════════════════════════════════════════════════════════
 Done.

   Admin page : https://${DOMAIN}
   API health : https://${DOMAIN}/healthz
   Certificate renews automatically (certbot.timer)

   To undo just this step:
     rm -f ${ENABLED} ${SITE}
     nginx -t && systemctl reload nginx
═══════════════════════════════════════════════════════════════════════════════
NEXT
