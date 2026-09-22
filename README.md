# OCL Maintenance

Field maintenance register for Orient Cement Limited — an Android app, a
self-hosted backend, and a browser admin page.

Replaces the earlier Google-Sheets-based design, which could not support real
logins, offline work, or remote device management.

```
┌─────────────────┐   HTTPS    ┌──────────────────────────────┐
│  Android app    │ ─────────▶ │  Your VPS                    │
│  (field phones) │            │  ├─ Caddy   (auto HTTPS)     │
│                 │ ◀───────── │  ├─ API     (Node + SQLite)  │
└─────────────────┘            │  └─ /releases  (APK updates) │
        ▲                      └──────────────────────────────┘
        │                                    ▲
        │  APK download                      │ git push → auto-deploy
        └────────────────────────────┐       │
                                     │  ┌────┴─────┐
                                     └──│  GitHub  │
                                        └──────────┘
```

---

## What's here

| Path | What it is |
|---|---|
| `app/` | The Android app (WebView wrapper + the checklist UI) |
| `server/` | Node.js + SQLite API, admin web page, APK upload |
| `server/test/` | 45 API tests, run by CI before every deploy |
| `deploy/setup-vps.sh` | One-time server setup (Docker, firewall, DuckDNS) |
| `deploy/update.sh` | Pull, back up, rebuild, health-check |
| `docker-compose.yml`, `Caddyfile` | The running stack |
| `.github/workflows/deploy.yml` | Push to `main` → tests → auto-deploy |

---

## Setting it up

### Step 1 — Put this code on GitHub

```bash
cd ocl-maintenance
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ocl-maintenance.git
git push -u origin main
```

### Step 2 — Set up the VPS (once)

SSH into your server and clone the repo there:

```bash
ssh root@YOUR-SERVER-IP
mkdir -p /opt && cd /opt
git clone https://github.com/YOUR-USERNAME/ocl-maintenance.git
cd ocl-maintenance
sudo bash deploy/setup-vps.sh
```

The script installs Docker, opens the firewall, sets up a free DuckDNS domain
with automatic HTTPS, and writes your `.env` file. It asks for your DuckDNS
subdomain and token — get them free at https://www.duckdns.org.

Then start it:

```bash
docker compose up -d --build
docker compose logs -f api      # watch it start; note the admin password
```

### Step 3 — Open the admin page

Go to `https://your-name.duckdns.org` and sign in.

From there you can add technician accounts, view and delete records, publish
checklist updates, and upload new APKs.

### Step 4 — Turn on automatic deploys (optional)

So that `git push` updates the live server, add four secrets in
**GitHub → your repo → Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VPS_HOST` | your server's IP address |
| `VPS_USER` | `root` (or your sudo user) |
| `VPS_SSH_KEY` | a **private** SSH key that can log into the server |
| `VPS_PATH` | `/opt/ocl-maintenance` |

To make the key:

```bash
# on your own computer
ssh-keygen -t ed25519 -f ocl-deploy -N ""
# paste the contents of ocl-deploy.pub into the server:
ssh root@YOUR-SERVER-IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys" < ocl-deploy.pub
# paste the contents of ocl-deploy (the private one) into the VPS_SSH_KEY secret
```

After that, pushing to `main` runs the tests and deploys automatically.

---

## Pointing the app at your server

Build the APK (`app/README.md`), install it, then:

1. Open the app and sign in with any password to get past the first screen, or
   submit nothing — the settings panel is reached from the **Done** screen.
2. Tap **⚙ Server & Google Sheets Setup**.
3. Enter your server address exactly, e.g. `https://ocl-plant.duckdns.org`
   (must be **https**).
4. Tap **Save & sign in**, then sign in with an account created in the admin page.

From then on the app:
- signs in against your server (no credentials are stored in the APK),
- pulls the checklist published by the server and caches it for offline use,
- uploads each submission straight away, or **queues it** and retries
  automatically when the phone is back in signal,
- reads past records from the server in the 🗂 Records tab,
- offers an update when you publish a new APK.

The **Live** indicator in the Records tab shows the server state and how many
records are waiting to upload.

---

## Running the tests

```bash
cd server && npm test                 # 45 API tests
node app/test/update-check.js         # 9 app update-channel tests
node app/test-app.js                  # 130 app behaviour tests (2 skipped, see below)
node app/verify-app.js                # structural checks on the app bundle
```

The two skipped tests in `test-app.js` cover the update dialog. They are skipped
because the harness's timer override runs the page's own start-up update check
before a test can install a native-version mock — an artefact of the test
environment, not the app. The same behaviour is covered properly by
`app/test/update-check.js`, which installs the bridge **before** the page loads,
exactly as a real phone does.

---

## Releasing an app update

1. Build the APK (see `app/README.md`).
2. In the admin page → **App releases** → upload the APK with a **higher version
   code** than the one installed on the phones.
3. Every phone is offered the update next time it opens the app.

The version code must always increase. If it does not, no phone will notice.

---

## Running the server locally (for development)

```bash
cd server
npm install
JWT_SECRET="a-development-secret-that-is-at-least-32-chars" npm start
# → http://localhost:3000
```

The first run creates an admin account and prints its password once.

---

## Backups

`deploy/update.sh` copies the database to `backups/` before every deploy and
keeps the last 14. To take one by hand:

```bash
cd /opt/ocl-maintenance
sqlite3 data/ocl.db ".backup 'backups/manual-$(date +%F).db'"
```

To restore, stop the stack, replace `data/ocl.db` with the backup, and start it
again. Copy backups off the server periodically — a dead disk takes its own
backups with it.

---

## Security notes

- Passwords are bcrypt-hashed on the server; no credentials ship inside the APK.
- Login tokens are signed (JWT) and expire after 30 days.
- Disabling an account takes effect immediately, including for tokens already
  issued.
- All traffic is HTTPS; the certificate renews automatically.
- Everything security-relevant is written to an audit log, visible in the admin
  page under **Activity**.
- The `.env` file holds your `JWT_SECRET`. It is gitignored — never commit it,
  and back it up somewhere safe.

---

## Troubleshooting

**The admin page won't load / certificate error**
DNS may not have propagated yet. Check `dig your-name.duckdns.org`, and give
Caddy a minute on first start (`docker compose logs caddy`).

**"JWT_SECRET is missing or too short"**
Your `.env` is absent or incomplete. Re-run `bash deploy/setup-vps.sh`.

**I lost the admin password**
```bash
cd /opt/ocl-maintenance
docker compose exec api node src/hashpw.js 'NewPassword123'
# then update it directly:
docker compose exec api node -e "
  const {Users}=require('./src/db');const {hashPassword}=require('./src/auth');
  Users.setPassword(1, hashPassword('NewPassword123'));console.log('done');"
```

**Deploys are failing**
Check the Actions tab on GitHub for the failing step, and
`docker compose logs --tail 50 api` on the server.
