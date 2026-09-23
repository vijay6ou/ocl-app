# Technician Android app

Portrait WebView app, package `com.ocl.maintenance`, label **Adani Cements**.

## Read this first: the source here is older than the app in the field

The plant is running **1.9.0 (versionCode 11)**. This directory builds **1.5.0
(versionCode 7)**, and `dist/` holds an even older **1.4.0 (versionCode 6)**.

The newer source was built elsewhere and never landed on the server — only its
finished APK did. Nothing on the VPS can reproduce the app technicians are
using today.

So:

- **`shipped/ocl-maintenance-v1.9.0-code11.apk` is the authoritative app.**
  It is committed to this repo on purpose. It is the only surviving copy, and
  without it the app would be unrecoverable if the server disk failed. Its
  source is missing.
- **`publishToPlantServer` will refuse to run** until `versionCode` in
  `app/build.gradle` is raised above whatever the plant server already serves.
  That refusal is deliberate — see below.
- Do not raise `versionCode` here to "make it publish". That would ship the
  1.4.0-era UI while telling every phone it is newer.

To fix this properly, recover the newer `android/` tree (the one that produced
app.js at 33,749 bytes with an `adani-mark.png` asset), merge it in, then bump.

## Identity

| | |
|---|---|
| Package | `com.ocl.maintenance` |
| min / target SDK | 21 / 34 |
| Server URL | baked into `BuildConfig.DEFAULT_SERVER_URL` |
| Signing key | `ocl-release.jks`, alias `ocl` |

The keystore is **not** in this repo and must never be. It is what allows an
updated APK to install over an already installed one. Its certificate
(SHA-256 `12:61:09:1A:...:3B:3B`) must match the shipped APK or updates stop
working. Keep an offline backup of it.

## Signing setup

Create `android/keystore.properties` (gitignored):

```
storeFile=ocl-release.jks
storePassword=<password>
keyAlias=ocl
keyPassword=<password>
```

Without it, `OCL_STORE_PASSWORD` and `OCL_KEY_PASSWORD` are used instead.

## The versionCode trap

`publishToPlantServer` copies the built APK over the one the plant server
serves. Run against a stale tree, that silently downgrades the live app:
Android refuses to install a lower `versionCode`, so technicians see
"App not installed" while the server keeps advertising a version it no longer
serves.

The task now compares against `data/releases/version-code.txt` and aborts if the
new `versionCode` is not strictly greater. **Delete that file only if you intend
to reset the published version.**

## Build

```bash
export ANDROID_HOME="$HOME/android-sdk"
cd android
./gradlew :app:publishToPlantServer      # writes dist/ and data/releases/
```

## Server URL and phones already in the field

Phones running 1.9.0 have `http://158.101.199.190` compiled in. That plain-HTTP
site is kept alive so they keep working. New builds use
`https://ocl.vishryfarms.com`.

On an existing phone, long-press the app title to reveal the server field, and
enter `https://ocl.vishryfarms.com` to move that device onto HTTPS without
reinstalling. Leave it blank to fall back to the baked-in URL.
