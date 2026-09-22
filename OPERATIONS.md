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

The database is one file. Take a copy whenever you like:

```bash
cd /opt/ocl-maintenance
sudo docker compose exec -T api node -e "require('fs').copyFileSync('/data/ocl.db','/data/bk.db')"
sudo docker cp \$(sudo docker compose ps -q api):/data/bk.db ./ocl-backup-\$(date +%F).db
sudo docker compose exec -T api rm -f /data/bk.db
```

**Copy that file off the server** (email it, put it on a USB stick). A backup that
only exists on the same disk is not a backup.

To restore: stop the stack, replace the volume's `ocl.db` with the backup, start
again.

### Updating the code

```bash
cd /opt/ocl-maintenance
git pull            # if the folder is a git checkout
bash deploy/update.sh
```

`update.sh` backs the database up first, rebuilds, restarts, waits for the health
check, and confirms your other services are still running.

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
