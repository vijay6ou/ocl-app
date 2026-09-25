package com.ocl.maintenance;

import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * In-app updates from this plant server (not Play Store).
 * GET /api/app/version — if versionCode is newer, download the hosted APK and prompt install.
 */
final class UpdateHelper {
    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean checking;

    UpdateHelper(MainActivity activity) {
        this.activity = activity;
    }

    void checkOnLaunch() {
        main.postDelayed(this::checkNow, 1800);
    }

    void checkNow() {
        checkNow(false);
    }

    void checkNow(boolean fromUser) {
        if (checking) return;
        final String origin = activity.getServerUrl();
        if (origin == null || origin.isEmpty() || MainActivity.isBuilderOnlyHost(origin)) {
            if (fromUser) {
                Toast.makeText(activity, "Cannot reach the plant server to check for updates.", Toast.LENGTH_SHORT).show();
            }
            return;
        }
        checking = true;
        new Thread(() -> {
            try {
                String body = httpGet(origin + "/api/app/version");
                JSONObject json = new JSONObject(body);
                int remote = json.optInt("versionCode", 0);
                boolean apkAvailable = json.optBoolean("apkAvailable", false);
                String notes = json.optString("notes", "");
                if (notes.matches("(?s).*https?://.*") || notes.matches("(?s).*\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}.*")) {
                    notes = "";
                }
                final String safeNotes = notes;
                String url = json.optString("url", origin + "/api/app/ocl-maintenance.apk");
                if (remote > BuildConfig.VERSION_CODE && apkAvailable) {
                    main.post(() -> promptInstall(url, safeNotes, remote));
                } else if (fromUser) {
                    main.post(() -> Toast.makeText(activity, "This is the latest technician app.", Toast.LENGTH_SHORT).show());
                }
            } catch (Exception e) {
                if (fromUser) {
                    main.post(() -> Toast.makeText(activity, "Update check failed.", Toast.LENGTH_SHORT).show());
                }
            } finally {
                checking = false;
            }
        }).start();
    }

    void downloadAndInstall(String apkUrl, String notes) {
        promptInstall(apkUrl, notes, BuildConfig.VERSION_CODE + 1);
    }

    private void promptInstall(String apkUrl, String notes, int remoteCode) {
        String message = notes == null || notes.trim().isEmpty()
                ? activity.getString(R.string.update_message)
                : notes + "\n\nversionCode " + remoteCode;
        new AlertDialog.Builder(activity)
                .setTitle(R.string.update_title)
                .setMessage(message)
                .setPositiveButton(R.string.update_now, (d, w) -> startDownload(apkUrl))
                .setNegativeButton(R.string.later, null)
                .show();
    }

    private void startDownload(String apkUrl) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(intent);
            Toast.makeText(activity, "Allow installs from Adani Cements, then tap Install update again.", Toast.LENGTH_LONG).show();
            return;
        }

        ProgressDialog progress = new ProgressDialog(activity);
        progress.setMessage("Downloading technician app…");
        progress.setIndeterminate(true);
        progress.setCancelable(false);
        progress.show();

        new Thread(() -> {
            File apkFile = new File(activity.getCacheDir(), "updates/ocl-maintenance.apk");
            try {
                File parent = apkFile.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    throw new IllegalStateException("Cannot create updates folder");
                }
                downloadTo(apkUrl, apkFile);
                main.post(() -> {
                    progress.dismiss();
                    installApk(apkFile);
                });
            } catch (Exception e) {
                main.post(() -> {
                    progress.dismiss();
                    Toast.makeText(activity, "Update download failed.", Toast.LENGTH_LONG).show();
                });
            }
        }).start();
    }

    private void installApk(File apkFile) {
        Uri uri = FileProvider.getUriForFile(activity, MainActivity.FILE_PROVIDER, apkFile);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(intent);
    }

    private static String httpGet(String urlSpec) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlSpec).openConnection();
        try {
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            conn.setRequestProperty("Accept", "application/json");
            int code = conn.getResponseCode();
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            byte[] buf = readAll(in);
            if (code >= 400) {
                throw new IllegalStateException("HTTP " + code);
            }
            return new String(buf, StandardCharsets.UTF_8);
        } finally {
            conn.disconnect();
        }
    }

    private static void downloadTo(String urlSpec, File dest) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlSpec).openConnection();
        try {
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            int code = conn.getResponseCode();
            if (code >= 400) throw new IllegalStateException("HTTP " + code);
            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    out.write(buf, 0, n);
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        if (in == null) return new byte[0];
        byte[] buf = new byte[4096];
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int n;
        while ((n = in.read(buf)) >= 0) {
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }
}
