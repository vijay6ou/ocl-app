# OCL Maintenance — Operations Guide

**This is the guide for your live installation.** It describes what is running,
where it lives, and what to do when something needs attention.

---

## Where everything is

| Thing | Value |
|---|---|
| Admin web page | **https://ocl.vishryfarms.com** |
| API health check | https://ocl.vishryfarms.com/healthz |
| Server | Oracle VPS `158.101.199.190` (`free-try1`), Ubuntu 26.04, arm64 |
| SSH login | `ssh -i <key> ubuntu@158.101.199.190` |
| Project on server | `/opt/ocl-maintenance` |
| Database | Docker volume `ocl-maintenance_ocl-data` (`/data/ocl.db` inside) |
| Uploaded APKs | `/opt/ocl-maintenance/releases` |
| nginx site file | `/etc/nginx/sites-available/ocl-maintenance` |
| Certificate | `/etc/letsencrypt/live/ocl.vishryfarms.com/` (auto-renewing) |
| Container | `ocl-maintenance-api-1`, listening on `127.0.0.1:3100` |

Your admin account is `admin`. **Change the password** from the admin page
(**Change password**, top right) if you have not already.

---

## Important: this server does other work

It also runs your fleet dashboard, archive app, Cloudflare Tunnel and trading
services. This installation is **deliberately additive** and does not touch any
of them:

- It does **not** use Caddy or claim ports 80/443 — your existing nginx stays in
  charge, and OCL is just one extra site file.
- The API container binds to **127.0.0.1:3100 only**, so it is not directly
  reachable from the internet; all traffic arrives through nginx over HTTPS.
- The install scripts validate the nginx config **before** reloading and roll
  back automatically if anything is wrong.

---

## Day-to-day: everything is done from the browser

You should not need a terminal for normal use.

| Task | Where |
|---|---|
| Add or remove a technician | Admin page → **Users** |
| Reset someone's password | Admin page → **Users** → Reset password |
| Disable a lost phone's account | Admin page → **Users** → Disable |
| Look up any day's records | Admin page → **Records**, or the app's 🗂 Records tab |
| Print or save a record as PDF | Admin page → Records → **View** → Print |
| Change checklist fields | **In the app**: 🗂 Records → ✏️ Edit fields → Save |
| Release a new app version | Admin page → **App releases** → upload APK |

---

## Releasing a new app version

1. Build the APK with a **higher version code** (see `app/README.md`).
2. Admin page → **App releases** → choose the APK, enter the version code and
   name, add notes, click **Upload & publish**.
3. Every phone is offered the update next time the app opens.

The version code must always increase. If it does not, no phone will notice.

---

## If something goes wrong

### The admin page will not load

```bash
ssh -i <key> ubuntu@158.101.199.190
cd /opt/ocl-maintenance
sudo docker compose ps          # is the container up?
sudo docker compose logs --tail 50 api
curl -s http://127.0.0.1:3100/healthz
```

If the container is down:

```bash
sudo docker compose up -d
```

If nginx is the problem:

```bash
sudo nginx -t                   # should say "test is successful"
sudo systemctl reload nginx
```

### The certificate did not renew

Certificates renew automatically, but you can force it and it is safe to run:

```bash
sudo certbot renew --dry-run    # test
sudo certbot renew              # apply
sudo systemctl reload nginx
```

### I need to change the admin password from the server

```bash
cd /opt/ocl-maintenance
sudo docker compose exec api node src/hashpw.js 'NewPassword123'
sudo docker compose exec api node -e "
  const {Users}=require('./src/db');const {hashPassword}=require('./src/auth');
  Users.setPassword(1, hashPassword('NewPassword123'));console.log('done');"
```

### Backups

A backup is taken automatically before every deploy, kept in
`/opt/ocl-maintenance/backups/` (the 14 most recent).

**Do not back up by copying `ocl.db` on its own.** This database runs in WAL
mode, so committed rows may live in `ocl.db-wal` while `ocl.db` holds only a few
kilobytes of empty schema — a plain copy can look like a valid backup and contain
nothing. That mistake was made once during setup and is why `deploy/update.sh`
now uses SQLite's own backup API.

To take one by hand:

```bash
cd /opt/ocl-maintenance
STAMP=$(date +%F-%H%M)
sudo docker exec ocl-maintenance-api-1 node src/db.js backup /data/bk.db
sudo docker cp ocl-maintenance-api-1:/data/bk.db "backups/ocl-${STAMP}.db"
sudo docker exec ocl-maintenance-api-1 rm -f /data/bk.db
ls -l "backups/ocl-${STAMP}.db"
```

A healthy backup is roughly **160 KB and growing**. If you see one of about
**4 KB, it is empty** — something went wrong, do not rely on it.

**Copy backups off the server** (email, USB stick, cloud drive). A backup that
only exists on the same disk is not a backup.

To restore: stop the stack, put the backup in the volume as `ocl.db`, and start
again:

```bash
cd /opt/ocl-maintenance
sudo docker compose down
sudo docker run --rm -v ocl-maintenance_ocl-data:/data -v "$PWD/backups:/bk" \
  alpine sh -c 'cp /bk/ocl-YOUR-BACKUP.db /data/ocl.db && rm -f /data/ocl.db-wal /data/ocl.db-shm'
sudo docker compose up -d
```

To verify a backup really contains your data before trusting it:

```bash
sudo docker cp backups/ocl-YOUR-BACKUP.db ocl-maintenance-api-1:/data/check.db
sudo docker exec ocl-maintenance-api-1 node -e "
  const D=require('better-sqlite3');const d=new D('/data/check.db',{readonly:true});
  console.log('users:',d.prepare('SELECT COUNT(*) n FROM users').get().n);
  console.log('records:',d.prepare('SELECT COUNT(*) n FROM records').get().n);
  console.log('configs:',d.prepare('SELECT COUNT(*) n FROM configs').get().n);d.close();"
sudo docker exec ocl-maintenance-api-1 rm -f /data/check.db
```

### Updating the code

`/opt/ocl-maintenance` is a **git checkout of this repository**, and the deploy
key installed on the server already has read/write access — so updating is:

```bash
ssh -i <key> ubuntu@158.101.199.190
cd /opt/ocl-maintenance
git pull origin main
bash deploy/update.sh
```

`update.sh` backs the database up first, rebuilds, restarts, waits for the health
check, and confirms your other services are still running.

Your `.env` and the database are **not** in git — `.env` is gitignored and the
database lives in a Docker volume — so pulling and rebuilding cannot lose either.

---

## Automatic deploys (optional, not enabled)

`.github/workflows/deploy.yml` can deploy on every push, but its deploy job stays
inactive until five secrets exist in
**GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VPS_HOST` | `158.101.199.190` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | a private key that can log in as that user |
| `VPS_PATH` | `/opt/ocl-maintenance` |
| `VPS_PORT` | `22` (optional) |

Until then the deploy job skips itself with a notice — it does not fail the build,
and the server is untouched. The **test job still runs on every push**, which is
useful on its own: your API tests are checked automatically.

---

## Undoing this installation completely

Nothing else on the server depends on it, so this is safe:

```bash
cd /opt/ocl-maintenance
sudo docker compose down -v                                   # stop + delete database
sudo rm -f /etc/nginx/sites-enabled/ocl-maintenance \
           /etc/nginx/sites-available/ocl-maintenance
sudo nginx -t && sudo systemctl reload nginx
```

Then delete the `ocl` DNS record in Cloudflare if you no longer want the name.

---

## What to check after any change

1. `https://ocl.vishryfarms.com/healthz` returns `{"ok":true,...}`
2. The admin page loads and you can sign in
3. Open the app on a phone, submit a test checklist, confirm it appears in
   Records
4. Confirm your other services still respond

---

## Known limitations

- **The app has not been tested on a physical phone.** Everything was verified
  with automated tests and against the live API, but no device was available.
  Test the print/PDF feature first — it relies on Android's print framework,
  which only exists on a real device.
- Two app tests are skipped; the reason is documented in `app/README.md`.
- Deleting a record is admin-only. Technicians cannot remove previously recorded
  values, by design.
