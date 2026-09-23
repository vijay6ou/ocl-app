# Adani Cements Weekly Electrical Maintenance

Technician log for **Adani Cements, Electrical Department, Chittapur**. One plant
section per weekday (Mon–Sat). The server file store is the source of truth for
the equipment catalogue, people, submissions, and defect photos.

Technicians use the Android app; admins use the web. Admins publish the live
catalogue from a Forms-style builder with no code. After a successful submit the
plant server posts **four Discord messages** in that date's thread (full form,
faults, photos, PDF). Discord is the only notify channel.

The app UI never shows the server address, Discord webhook, or env paths.
User-visible branding is **Adani Cements**.

## Live deployment

| | |
|---|---|
| Web app (HTTPS) | https://ocl.vishryfarms.com |
| Bare-IP HTTP | http://158.101.199.190 — kept only so installed APKs keep working |
| Server path | `/opt/ocl-technician-log` |
| Service | `ocl-technician-log.service` (Next.js on `127.0.0.1:43127`) |
| nginx sites | `ocl-plant-log` (domain, TLS), `ocl-technician-log` (bare IP) |
| Notify config | `/etc/ocl-technician-log.env` (mode 0600) |

The bare-IP site is plain HTTP because phones running APK 1.9.0 have that
address compiled in. **New devices should use the HTTPS domain.** On an
existing phone, long-press the app title and enter `https://ocl.vishryfarms.com`
to move it onto HTTPS without reinstalling.

### Deploy a change

```bash
cd /opt/ocl-technician-log
git pull origin main
sudo bash deploy/update.sh
```

The server directory is a git checkout. `data/` is gitignored, so pulling never
touches live records or photos.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127). The first start creates
`data/` (JSON store + photo uploads) and seeds accounts plus the catalogue.

Production-style:

```bash
npm run build
npm start
```

## Accounts

Accounts are seeded on first boot and each person has a hashed 4-digit submit
PIN (an admin can set or reset it in **People**).

The seed usernames and default passwords are in `lib/constants.ts`, and the seed
PINs in `lib/seed-pins.ts`. **Those defaults are published in this repo, so they
must be changed before any real deployment.** On the live plant every account
has been moved off its seed value; confirm with the People page after any fresh
install.

- Password: minimum 8 characters.
- PIN: exactly 4 digits, locked for 15 minutes after 5 wrong attempts.
- Sessions last 12 hours and survive a restart.

## Workflow

1. Sign in with a personal account.
2. Pick Monday–Saturday (Additive, Bauxite, Gypsum, LC-8/Tippler, Coal reclaimers, Coal crusher & stacker).
3. Enter shift, mark equipment RUNNING or STOPPED, fill readings, OK/FAIL checks, remarks, and equipment photos (**rear camera or gallery**).
4. Submit — mandatory **front-camera selfie** (no gallery) then the **4-digit PIN**. The round is archived on the server first, then Discord is notified (selfie included with photos and PDF). The exact submit time is stored and shown on the record, PDF, and Discord full-form message (plant local IST).
5. Print / save PDF (date, submit timestamp, working section, e.g. Monday – Additive Section, plus the full round with upright photos).
6. Search and reprint history from the cloud archive — last **30 days** of saved records for every signed-in technician and admin.

### Admin: add a parameter column

1. Sign in as admin.
2. Open **Catalogue** → the weekday (for example Monday – Additive Section).
3. Open the equipment card.
4. Under **Parameter columns** tap **Add field**.
5. Fill the column title, unit, limit, and optional R/Y/B.
6. Tap **Publish to plant server**. Technicians get the new column on the next load.

Existing OCL equipment ids and tags stay unless you expand **Advanced** and
change them. Reorder with the up/down chevrons. Add OK/FAIL items with
**Add question**.

## Technician Android APK

Portrait WebView `com.ocl.maintenance` **1.9.0** (versionCode **11**), served at
`/api/app/ocl-maintenance.apk`. The APK bakes in the plant server URL and does
not show it in the UI; leftover builder/LAN URLs (`172.30.0.2`, `127.0.0.1`,
`192.168.x`, port `43127`) are ignored.

Default shift is **General (09:00–18:00)**. Equipment is logged as compact
interactive cards, photos sit at the end of each machine, and half-filled rounds
auto-save. The in-app **Update** tab shows **Plant server** version codes only.

If the plant server is down the app shows **Cannot reach plant server** and
**Retry**. Long-press the title to reveal the server field.

Equipment **Rear camera** opens the in-app Camera2 activity on
`LENS_FACING_BACK`. **Gallery** is the system image picker with no `capture`
attribute. The submit selfie uses `LENS_FACING_FRONT` only — no gallery on that
gate.

> **The `android/` source in this repo is older than the app in the field.**
> It builds 1.5.0 (versionCode 7); the plant runs 1.9.0 (versionCode 11), whose
> source is missing. See **[android/README.md](android/README.md)** before
> building anything, and note that `publishToPlantServer` deliberately refuses
> to overwrite the live APK with an older build.

### Install on a phone

```bash
adb install -r android/dist/ocl-maintenance.apk
```

Or open `https://ocl.vishryfarms.com/download` on the phone.

## Notify (Discord)

The webhook lives on the plant server only, never in git or the APK:

```
DISCORD_WEBHOOK_URL=      # see .env.example
```

It is read from `/etc/ocl-technician-log.env`, injected by a systemd drop-in.
A Discord failure does not roll back a saved record.

On submit Discord (same-date forum thread) gets:

1. Full form (same layout as the in-app record, including the exact submit timestamp)
2. Faults / wrong items only
3. Photos (including the submit selfie), upright
4. PDF

## Data and backups

Runtime files live in `data/` (gitignored) — this is the only copy of the plant
record:

- `catalogue.json` — live checklist, seeded from `lib/seed/all-days-data.json`
- `users.json` / `sessions.json` — password and PIN hashes at rest
- `submissions.json`
- `photos.json` + `uploads/`
- `discord-threads.json` — date → Discord thread id
- `releases/ocl-maintenance.apk` — the APK served to phones
- `releases/version-code.txt` — guard against publishing an older APK

Writes go through a temp file plus atomic rename, so a crash cannot leave a
half-written JSON file. There is still only one copy: **take backups.** A
snapshot command and restore steps are in [OPERATIONS.md](OPERATIONS.md).

## Secrets — never commit

| Secret | Where it lives |
|---|---|
| Discord webhook | `/etc/ocl-technician-log.env` |
| Android release keystore | `android/ocl-release.jks` (gitignored) |
| Keystore passwords | `android/keystore.properties` (gitignored) |
| JWT/login material | server env only |

The keystore is unrecoverable if lost and dangerous if leaked: it is what lets
an updated APK install over an installed one. Keep an offline copy.
