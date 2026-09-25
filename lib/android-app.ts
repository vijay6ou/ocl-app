export const ANDROID_APP = {
  packageId: "com.ocl.maintenance",
  displayName: "Adani Cements",
  versionName: "1.12.0",
  versionCode: 14,
  apkFileName: "ocl-maintenance.apk",
  notes:
    "Location check-ins use Android LocationManager in the APK (no permission banner). Admin Presence shows who is on the app, last seen, and time spent. Esri World Imagery snapshots, 15-minute slots, add-at-top catalogue.",
} as const;
