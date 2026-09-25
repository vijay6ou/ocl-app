package com.ocl.maintenance;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * While the technician app is open, post lat/lng on 15-minute wall-clock slots.
 * WebView geolocation covers the page; this keeps sending if the activity stays alive.
 */
public class LocationHelper {
    static final int REQ_LOCATION = 4106;
    private static final long SLOT_MS = 15 * 60 * 1000L;

    private final MainActivity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::onSlot;
    private boolean started;
    private Location lastFix;

    LocationHelper(MainActivity activity) {
        this.activity = activity;
    }

    void start() {
        if (started) return;
        started = true;
        ensurePermission();
        scheduleNext();
        pingNow();
    }

    void stop() {
        started = false;
        handler.removeCallbacks(tick);
    }

    boolean hasPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    void ensurePermission() {
        if (hasPermission()) return;
        ActivityCompat.requestPermissions(
                activity,
                new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                },
                REQ_LOCATION
        );
    }

    void onPermissionResult() {
        if (hasPermission()) pingNow();
    }

    private void scheduleNext() {
        handler.removeCallbacks(tick);
        long delay = SLOT_MS - (System.currentTimeMillis() % SLOT_MS) + 750;
        handler.postDelayed(tick, delay);
    }

    private void onSlot() {
        pingNow();
        scheduleNext();
    }

    void pingNow() {
        if (!hasPermission()) return;
        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return;
        Location best = null;
        try {
            Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            Location net = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            best = newer(gps, net);
        } catch (SecurityException ignored) {
            return;
        }
        if (best != null) {
            lastFix = best;
            post(best);
        }
        try {
            String provider = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    ? LocationManager.GPS_PROVIDER
                    : LocationManager.NETWORK_PROVIDER;
            lm.requestSingleUpdate(provider, new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    post(location);
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
            }, Looper.getMainLooper());
        } catch (SecurityException ignored) {
        } catch (IllegalArgumentException ignored) {
        }
    }

    private static Location newer(Location a, Location b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.getTime() >= b.getTime() ? a : b;
    }

    String lastLocationJson() {
        Location loc = lastFix;
        if (loc == null && hasPermission()) {
            LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
            if (lm != null) {
                try {
                    loc = newer(
                            lm.getLastKnownLocation(LocationManager.GPS_PROVIDER),
                            lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    );
                } catch (SecurityException ignored) {
                    loc = null;
                }
            }
            if (loc != null) lastFix = loc;
        }
        if (loc == null) return "";
        try {
            JSONObject body = new JSONObject();
            body.put("lat", loc.getLatitude());
            body.put("lng", loc.getLongitude());
            if (loc.hasAccuracy()) body.put("accuracy", loc.getAccuracy());
            return body.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private void post(final Location location) {
        lastFix = location;
        final String origin = activity.getServerUrl();
        if (origin == null || origin.isEmpty()) return;
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
