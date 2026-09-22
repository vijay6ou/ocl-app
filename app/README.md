# OCL Maintenance — App

The Android app: a thin WebView wrapper plus the checklist UI in
`app/src/main/assets/index.html`.

**Version 3.0.0 (versionCode 4)** — talks to your own VPS instead of Google Sheets.
**Package:** `com.adani.ocl.maintenance` · **Min Android:** 5.0 (API 21)

---

## What changed from 2.x

| | 2.x | 3.0.0 |
|---|---|---|
| Where records live | Google Sheets or the device | **Your VPS** |
| Sign-in | Password hashes inside the APK | **Server-issued accounts** |
| Offline | Nothing queued | **Records queue and upload automatically** |
| Checklist | Edited per device | **Published centrally, cached offline** |
| Updates | A link in a spreadsheet | **Admin page upload → every phone offered it** |

Google Sheets code remains in the app, but is only used when **no server address
is configured**. Point the app at a server and the sheet path is never touched.

---

## Building the APK

### With Android Studio

Open the `app/` folder, let Gradle sync, then
**Build → Build Bundle(s) / APK(s) → Build APK(s)**.

### Without Android Studio (how the release APK was produced)

The project has no external dependencies, so a plain toolchain is enough: JDK 17
plus Android SDK build-tools and platform 34.

```powershell
pwsh -File ..\build-apk.ps1
```

That script runs `aapt2 → javac → d8 → zip → zipalign → apksigner` and writes to
`app/build/outputs/apk/release/`.

**Signing:** the release APK is signed with `ocl-release.jks` (alias `ocl`). Keep
that keystore safe — losing it means no future build can update an installed app.

---

## Configuring the app

1. Install the APK and open it.
2. Reach the **Done** screen (submit a checklist, or open the settings panel).
3. Open **⚙ Server & Google Sheets Setup**.
4. Enter your server address, e.g. `https://ocl-plant.duckdns.org` —
   **https only**; Android blocks plain http.
5. Tap **Save & sign in**, then sign in with an account created in the admin page.

The address is stored on the device and mirrored into native preferences, so it
survives a WebView cache clear.

---

## Testing

```bash
node test/update-check.js    # 9 tests  — update channel (bridge pre-installed)
node test-app.js             # 130 tests — checklist, records, auth, offline queue
node verify-app.js           # structural checks on the bundled HTML
```

The two skipped tests in `test-app.js` cover the update **dialog**. They are
skipped because that harness's timer override runs the page's own start-up update
check before a test can install a native-version mock — a limitation of the test
environment, not the app. The behaviour is properly covered by
`test/update-check.js`, which installs the bridge *before* the page loads, exactly
as a real phone does.

---

## Editing the checklist

Admins change every field from inside the app — **Records → ✏️ Edit fields**.
Add, rename, reorder or delete equipment, parameters and checks, then
**💾 Save changes**. Validation refuses duplicate ids, unnamed parameters and an
empty checklist before anything is written.

The shipped checklist (57 equipment, 1,165 checks) is the default. A
server-published or locally edited version takes priority over it, so an app
update never silently discards your customisations.

---

## Numeric entries

Parameter fields are numbers only, with a **digits keypad** and **at most two
decimal places**. Letters and units typed in by mistake are stripped and the field
corrects itself, so what is stored always matches what is shown.
