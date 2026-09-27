package com.ocl.maintenance;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.CookieManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * Keeps a 15-minute location check-in going while the technician app is in the
 * background. Posts only inside the plant duty window (default 08:00–20:00 IST).
 */
public class LocationService extends Service {
    private static final String PREFS = "ocl_location_window";
    private static final String KEY_START = "start";
    private static final String KEY_END = "end";
    private static final String KEY_ENABLED = "enabled";
    private static final String CHANNEL = "ocl_location";
    private static final int NOTIF_ID = 4107;
    private static final long SLOT_MS = 15 * 60 * 1000L;
    private static final String ZONE = "Asia/Kolkata";

    static volatile Location lastFix;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::onTick;
    private LocationListener listener;
    private boolean updatesRequested;

    static void saveWindow(Context context, String start, String end, boolean enabled) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(KEY_START, start == null || start.isEmpty() ? "08:00" : start)
                .putString(KEY_END, end == null || end.isEmpty() ? "20:00" : end)
                .putBoolean(KEY_ENABLED, enabled)
                .apply();
    }

    static void start(Context context) {
        Intent intent = new Intent(context, LocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!hasPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!promoteToForeground()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        listen();
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        stopListening();
        super.onDestroy();
    }

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean promoteToForeground() {
        try {
            Notification notification = buildNotification(insideWindow());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private Notification buildNotification(boolean open) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL,
                    "Location check-in",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("On-duty location while the plant log is in the background");
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String start = prefs.getString(KEY_START, "08:00");
        String end = prefs.getString(KEY_END, "20:00");
        String text = open
                ? "Location check-in until " + end
                : "Location paused until " + start;
        Intent launch = new Intent(this, MainActivity.class);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent content = PendingIntent.getActivity(this, 0, launch, piFlags);
        return new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Adani Cements")
                .setContentText(text)
                .setOngoing(true)
                .setContentIntent(content)
                .build();
    }

    private void onTick() {
        new Thread(this::refreshWindowFromServer, "ocl-window").start();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (!insideWindow()) {
            stopListening();
            if (nm != null) nm.notify(NOTIF_ID, buildNotification(false));
            handler.postDelayed(tick, millisUntilOpen());
            return;
        }
        listen();
        if (nm != null) nm.notify(NOTIF_ID, buildNotification(true));
        captureAndPost();
        long delay = SLOT_MS - (System.currentTimeMillis() % SLOT_MS) + 800;
        handler.postDelayed(tick, delay);
    }

    private long millisUntilOpen() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, true)) return SLOT_MS;
        int start = parseMinutes(prefs.getString(KEY_START, "08:00"), 8 * 60);
        Calendar when = Calendar.getInstance(TimeZone.getTimeZone(ZONE));
        when.set(Calendar.HOUR_OF_DAY, start / 60);
        when.set(Calendar.MINUTE, start % 60);
        when.set(Calendar.SECOND, 5);
        when.set(Calendar.MILLISECOND, 0);
        long delay = when.getTimeInMillis() - System.currentTimeMillis();
        if (delay < 15_000) {
            when.add(Calendar.DAY_OF_YEAR, 1);
            delay = when.getTimeInMillis() - System.currentTimeMillis();
        }
        return Math.max(15_000, delay);
    }

    private void listen() {
        if (updatesRequested || !hasPermission()) return;
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm == null) return;
        listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                lastFix = location;
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String provider) {
            }

            @Override
            public void onProviderDisabled(String provider) {
            }
        };
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, SLOT_MS, 0f, listener, Looper.getMainLooper());
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, SLOT_MS, 0f, listener, Looper.getMainLooper());
            }
            updatesRequested = true;
        } catch (SecurityException ignored) {
            updatesRequested = false;
        }
    }

    private void stopListening() {
        if (!updatesRequested || listener == null) return;
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm != null) {
            try {
                lm.removeUpdates(listener);
            } catch (Exception ignored) {
            }
        }
        updatesRequested = false;
    }

    private void captureAndPost() {
        if (!hasPermission()) return;
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm == null) return;
        Location best = lastFix;
        try {
            best = newer(best, lm.getLastKnownLocation(LocationManager.GPS_PROVIDER));
            best = newer(best, lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER));
        } catch (SecurityException ignored) {
            return;
        }
        if (best != null) {
            lastFix = best;
            post(best);
        }
    }

    private static Location newer(Location a, Location b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.getTime() >= b.getTime() ? a : b;
    }

    private boolean insideWindow() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, true)) return false;
        int start = parseMinutes(prefs.getString(KEY_START, "08:00"), 8 * 60);
        int end = parseMinutes(prefs.getString(KEY_END, "20:00"), 20 * 60);
        if (start == end) return false;
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone(ZONE));
        int now = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE);
        if (start < end) return now >= start && now < end;
        return now >= start || now < end;
    }

    private void refreshWindowFromServer() {
        String origin = origin();
        if (origin.isEmpty()) return;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(origin + "/api/location/window").openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("GET");
            if (conn.getResponseCode() != 200) return;
            InputStream in = conn.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            reader.close();
            JSONObject json = new JSONObject(body.toString());
            JSONObject window = json.optJSONObject("window");
            if (window == null) return;
            saveWindow(
                    this,
                    window.optString("start", "08:00"),
                    window.optString("end", "20:00"),
                    window.optBoolean("enabled", true)
            );
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static int parseMinutes(String value, int fallback) {
        if (value == null || !value.matches("\\d{2}:\\d{2}")) return fallback;
        int hour = Integer.parseInt(value.substring(0, 2));
        int minute = Integer.parseInt(value.substring(3, 5));
        if (hour > 23 || minute > 59) return fallback;
        return hour * 60 + minute;
    }

    private String origin() {
        String stored = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).getString(MainActivity.KEY_SERVER, "");
        if (stored == null) stored = "";
        stored = stored.trim();
        if (stored.isEmpty() || MainActivity.isLeftoverHost(stored)) {
            return MainActivity.normalizeServerUrl(BuildConfig.DEFAULT_SERVER_URL);
        }
        return MainActivity.normalizeServerUrl(stored);
    }

    private void post(final Location location) {
        if (!insideWindow()) return;
        final String origin = origin();
        if (origin.isEmpty()) return;
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                JSONObject body = new JSONObject();
                body.put("lat", location.getLatitude());
                body.put("lng", location.getLongitude());
                if (location.hasAccuracy()) body.put("accuracy", location.getAccuracy());
                URL url = new URL(origin + "/api/location");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(12000);
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("User-Agent", "OCLMaintenance/" + BuildConfig.VERSION_NAME);
                String cookie = CookieManager.getInstance().getCookie(origin);
                if (cookie != null && !cookie.isEmpty()) {
                    conn.setRequestProperty("Cookie", cookie);
                }
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(bytes.length);
                OutputStream os = conn.getOutputStream();
                os.write(bytes);
                os.close();
                conn.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "ocl-location").start();
    }
}
