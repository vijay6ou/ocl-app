# Operations

Runbook for the Adani Cements plant log on the Oracle VPS (`free-try1`,
`158.101.199.190`, Ubuntu arm64).

## What runs where

| Piece | Detail |
|---|---|
| Web app | Next.js, `127.0.0.1:43127`, unit `ocl-technician-log.service` |
| Code | `/opt/ocl-technician-log` (git checkout of `main`) |
| Live data | `/opt/ocl-technician-log/data` (gitignored — not in git) |
| Public HTTPS | https://ocl.vishryfarms.com via nginx site `ocl-plant-log` |
| Public HTTP | http://158.101.199.190 via nginx site `ocl-technician-log` |
| TLS cert | `/etc/letsencrypt/live/ocl.vishryfarms.com/` (certbot, auto-renews) |
| Secrets | `/etc/ocl-technician-log.env`, mode 0600 |
| Backups | `/var/backups/ocl-technician-log/` |

The bare-IP HTTP site exists **only** because phones running APK 1.9.0 have
`http://158.101.199.190` compiled in. Do not remove it while any of those phones
are still in use. Traffic over it is unencrypted; move devices to
`https://ocl.vishryfarms.com` (long-press the app title) and retire it once none
remain.

This VPS hosts unrelated live services (`archive`, `cloudflared`,
`fleet-dashboard`, tunnels, other apps). Changes here must stay additive — do not
touch their nginx sites, ports, or units.

## Deploying a change

```bash
cd /opt/ocl-technician-log
git pull origin main
sudo bash deploy/update.sh
```

`deploy/update.sh` stops the service, stashes the current build, rebuilds, and
health-checks. If the build or the health check fails it restores the previous
build and restarts, so a bad commit does not take the plant log down. It then
prunes old builds, reloads nginx only if `nginx -t` passes, and verifies both
public endpoints.

## Backups

```bash
sudo bash deploy/backup.sh
```

Writes a verified `ocl-data-<UTC>.tar.gz` to `/var/backups/ocl-technician-log/`
and keeps the newest 14. It fails loudly if the archive does not actually
contain `data/submissions.json` — an empty-looking tarball is the classic silent
backup failure.

To run it nightly:

```bash
sudo tee /etc/systemd/system/ocl-backup.service >/dev/null <<'EOF'
[Unit]
Description=Back up OCL plant log data

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/ocl-technician-log/deploy/backup.sh
EOF

sudo tee /etc/systemd/system/ocl-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Nightly OCL plant log backup

[Timer]
OnCalendar=*-*-* 20:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ocl-backup.timer
sudo systemctl list-timers ocl-backup.timer
```

### Restore

```bash
sudo systemctl stop ocl-technician-log
cd /opt/ocl-technician-log
sudo mv data data.broken-$(date -u +%Y%m%dT%H%M%SZ)
sudo tar xzf /var/backups/ocl-technician-log/ocl-data-<STAMP>.tar.gz
sudo chown -R ubuntu:ubuntu data
sudo systemctl start ocl-technician-log
curl -fsS http://127.0.0.1:43127/api/health; echo
```

Then sign in as admin and check **History** shows the expected records.

## TLS

```bash
sudo certbot renew --dry-run     # confirm renewal still works
sudo certbot certificates        # expiry
systemctl list-timers certbot.timer
```

Renewal uses the webroot `/var/www/html`; the port-80 server block for
`ocl.vishryfarms.com` must keep its `/.well-known/acme-challenge/` location or
renewal will fail.

## Common problems

**Phones show "Cannot reach plant server".**
Check `systemctl status ocl-technician-log`, then `curl -fsS
http://127.0.0.1:43127/api/health`. If the service is up, check that the
bare-IP nginx site still exists — phones on 1.9.0 cannot use the domain.

**Login says the session expired immediately.**
Cookies are `httpOnly`, `sameSite=lax`, and intentionally **not** `secure`, so
that the same session works over both the HTTPS domain and the bare-IP HTTP
site. If you set `secure`, logins over the IP will break.

**Discord stopped posting.**
The webhook is in `/etc/ocl-technician-log.env`. A rotated or deleted webhook is
the usual cause. Check `data/notify-last.json` for the last attempt and its
error. Discord failure never rolls back a saved record.

**A technician's submit PIN is locked.**
5 wrong attempts locks it for 15 minutes. An admin can reset it in **People**.

**An admin wants to publish a catalogue change.**
**Catalogue** → weekday → equipment card → **Add field** → **Publish to plant
server**. Technicians pick it up on next load.

**The APK must be rebuilt.**
Read `android/README.md` first. The `android/` source in this repo is **older
than the app in the field**, and `publishToPlantServer` refuses to publish it —
overwriting the live APK with an older build would leave phones unable to
install. The APK currently served is preserved at
`android/shipped/ocl-maintenance-v1.9.0-code11.apk`.

## History

The earlier Express + SQLite API that served `ocl.vishryfarms.com` was retired
once this app replaced it. Its code is preserved on the git tag
`archive/ocl-maintenance-api-server`, and its database plus a full tree snapshot
are in `/var/backups/ocl-maintenance-retired/`.
