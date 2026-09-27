# Adani Cements Weekly Electrical Maintenance

Cloud-backed technician log for **Adani Cements, Electrical Department, Chittapur**. The plant is a tree: **plant → section → area**. The first plant is Adani Cements Chittapur. Material handling is a section with areas Additive, Bauxite, Gypsum, LC-8 / Tippler, Coal reclaimers, and Coal crusher. Admins add empty plants, sections, and areas when needed. A technician only sees the locations they are assigned. The server file store is the source of truth for the equipment catalogue, people, submissions, and defect photos.

The technician APK opens the plant server only. Admins publish the live catalogue from a Forms-style builder. After a successful submit the plant server posts **four Discord messages** in that date’s thread (full form, faults, photos, PDF). Discord is the only notify channel.

The app UI never shows the server address, Discord webhook, or env paths. User-visible branding is **Adani Cements**. Existing OCL equipment ids and tags stay in the catalogue.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127). The first start creates `data/` (JSON store + photo uploads) and seeds accounts plus the plant catalogue.

Production-style:

```bash
npm run build
npm start
```

## Seed logins

Do not reuse APK default password hashes. These accounts are created on first boot. Each person also has a hashed 4-digit submit PIN (admin can set/reset in People). Seed PIN values are not listed in the app UI.

| Role | Username | Password | Name on reports |
|---|---|---|---|
| Admin | `admin` | `Chittapur-Admin-26` | Electrical Admin |
| Technician | `ramesh.k` | `ShiftA-Ramesh-26` | Ramesh Kumar |
| Technician | `priya.m` | `ShiftB-Priya-26` | Priya Menon |
| Technician | `suresh.n` | `ShiftC-Suresh-26` | Suresh Naik |
| Technician | `anjali.p` | `General-Anjali-26` | Anjali Patil |

## Workflow

1. Sign in with a personal account.
2. Open an area from the plant tree. You only see plants, sections, and areas assigned to you. Material handling currently has Additive, Bauxite, Gypsum, LC-8 / Tippler, Coal reclaimers, and Coal crusher.
3. Enter shift, mark equipment RUNNING or STOPPED, fill readings, OK/FAIL checks, remarks, and equipment photos (**rear camera or gallery**). Each photo is filed under that machine’s **equipment ID** in Files (plant → section → area → equipment ID).
4. On **Summary**, write a short day note and attach photos if needed, then submit — mandatory **front-camera selfie** (no gallery) then **4-digit PIN**. The round is archived on the server first, then Discord is notified (selfie included with photos and PDF). The exact submit time is stored and shown on the record, PDF, and Discord full-form message (plant local IST).
5. Open **Files** to browse the same plant tree and open a motor’s album (keyed by equipment ID). Round photos are already there. You can also add a nameplate or defect shot from the rear camera or gallery without filling a round.
6. Print / save PDF (date, submit timestamp, working section, e.g. Monday – Additive Section, plus the full round with upright photos and the day note).
7. Search and reprint history from the cloud archive — last **30 days** of saved records for your assigned areas (admin sees the whole plant). Older weekday logs still appear, labelled Additive, Gypsum, and so on.

### Admin: plant tree, blocks, and access

1. Sign in as admin and open **Catalogue**. The tree is plant → section → area. Add empty plants, sections, and areas from the tree. **Copy** on an area duplicates it (Cement mill 1 → Cement mill 2) or copies its motors onto another area. **Copy** on a section clones every area in that section.
2. Open an area to edit its form. **Add equipment block** can drop a **super block** (a stacker of five motors) or one type. **Copy card** on a machine duplicates it for motor 1 vs motor 2. **Save as super block** bundles the current form’s types for reuse.
3. Open **Blocks** to edit a type, **Copy type** for a near-duplicate (change one or two checks), add a type, or build a super block from types. **Copy kit** does the same for super blocks. Saving a type updates every working form that already uses it. Submitted records stay frozen.
4. Open **People** → **Locations** to assign a technician a whole plant, a section, or named areas (more than one is allowed).

### Admin: add a parameter column

1. Sign in as admin.
2. Open **Catalogue** → Additive (or another area).
3. Open the equipment card.
4. Under **Parameter columns** tap **Add field**.
5. Fill the column title, unit, limit, and optional R/Y/B.
6. Tap **Publish to plant server**. Technicians get the new column on the next load.

Existing OCL equipment ids and tags stay unless you expand **Advanced** and change them. Reorder with the up/down chevrons. Add OK/FAIL items with **Add question**.

## Technician Android APK

Portrait WebView `com.ocl.maintenance` **1.15.0** (versionCode **17**). The APK does not show the plant server in the UI. There is no first-run “enter plant server” screen. Leftover builder/LAN URLs (`172.30.0.2`, `127.0.0.1`, `192.168.x`, port `43127`) are ignored.

Default shift is **General (09:00–18:00)**. Equipment is logged as compact interactive cards. Photos sit at the end of each machine. Half-filled rounds auto-save. The in-app **Update** tab shows **Plant server** version codes only.

If the plant server is down the app shows **Cannot reach plant server** and **Retry**. Long-press the title to reveal an admin-only server field (empty hint — not a host).

Equipment **Rear camera** opens the in-app Camera2 activity on `LENS_FACING_BACK` via `OCLNative.capturePhoto("environment")`. **Gallery** is an `<input type="file" accept="image/*">` with no `capture` attribute (system image picker). The submit selfie uses `LENS_FACING_FRONT` only — no gallery on that gate. The equipment chevron is the only expand/collapse control. Signed-in technicians send one location ping per 15-minute slot while the app is open (coordinates always; Esri World Imagery snapshot attached when the free fetch works). The phone takes a single short fix and then releases GPS — no background notification and no permission popup. Admin **Presence** sets the duty window (default **08:00–20:00 IST**). Outside that window the phone does not record a point and Presence hides the map. The Forms builder **Add equipment block** / **Add field** buttons at the top of a list insert at the start.

Admin **Presence** shows who is on the app now, sign-in / last seen, and time spent today. Admin **Storage** shows plant `data/` disk use and can delete saved records between two dates. Photos already filed in an equipment album are kept. Catalogue and people are not deleted.

### Install on a phone

1. Install `ocl-maintenance.apk` (Project store docs, or `/api/app/ocl-maintenance.apk` on the plant server).
2. The app opens the plant log. Sign in with a seeded technician account.
3. If the host is unreachable, tap **Retry**.

```bash
adb install -r android/dist/ocl-maintenance.apk
```

### Build the APK

Requires Android SDK 34, JDK 17+, and the plant-release keystore (`android/ocl-release.jks`).

```bash
export ANDROID_HOME="$HOME/android-sdk"
cd android
./gradlew :app:publishToPlantServer
```

That writes `android/dist/ocl-maintenance.apk` and `data/releases/ocl-maintenance.apk`.

## Notify (VPS only)

Set on the plant server, never in git or the APK:

```
DISCORD_WEBHOOK_URL=
LOCATION_DISCORD_WEBHOOK_URL=
```

Location posts include lat/lng and, when the fetch succeeds, a JPEG from **Esri World Imagery** (ArcGIS Online MapServer export — no API key). There is no `GOOGLE_MAPS_STATIC_KEY`.

See `.env.example`. Discord failure does not roll back a saved record.

On submit Discord (same-date forum thread) gets:

1. Full form (same layout as the in-app record, including the exact submit timestamp)
2. Faults / wrong items only
3. Photos (including the submit selfie), upright
4. PDF

## Data

Runtime files live in `data/` (gitignored):

- `catalogue.json` — live checklist, seeded from `lib/seed/all-days-data.json`
- `users.json` / `sessions.json` — PIN hashes at rest (`pinHash`); lockout after 5 failed attempts (15 minutes)
- `submissions.json`
- `photos.json` + `uploads/` (legacy blobs) + `media/{plant}/{section}/{area}/{equipmentId}/` (one folder per machine)
- `discord-threads.json` — date → Discord thread id
- `releases/ocl-maintenance.apk` — hosted technician app
- `presence.json` — who is on the app (sign-in, last seen, sessions; no IP)
- `location-window.json` — duty window for location check-ins (default 08:00–20:00 IST)
