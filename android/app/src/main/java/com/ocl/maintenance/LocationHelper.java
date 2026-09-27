package com.ocl.maintenance;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * One short fix per 15-minute slot. Never keeps GPS running, never shows a
 * notification, and never prompts for permission.
 */
public class LocationHelper {
    private static final long FRESH_MS = 2 * 60 * 1000L;
    private static final long ONCE_MS = 1100L;

    static volatile Location lastFix;

    private final MainActivity activity;

    LocationHelper(MainActivity activity) {
        this.activity = activity;
    }

    void start() {
        clearStaleTrackingNotice();
    }

    void stop() {
        /* nothing held */
    }

    boolean hasPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    void ensurePermission() {
        /* no-op: do not prompt */
    }

    void onPermissionResult() {
        /* no-op */
    }

    String captureOnce() {
        if (!hasPermission()) return "";
        Location known = readLastKnown();
        long now = System.currentTimeMillis();
        if (known != null && now - known.getTime() <= FRESH_MS) {
            lastFix = known;
            return toJson(known);
        }
        Location one = takeOneFix();
        if (one != null) {
            lastFix = one;
            return toJson(one);
        }
        if (known != null) {
            lastFix = known;
            return toJson(known);
        }
        return lastFix == null ? "" : toJson(lastFix);
    }

    private void clearStaleTrackingNotice() {
        NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(4107);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.deleteNotificationChannel("ocl_location");
        }
    }

    private Location takeOneFix() {
        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;
        String provider = provider(lm);
        if (provider == null) return null;
        final Location[] box = new Location[1];
        final CountDownLatch done = new CountDownLatch(1);
        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                box[0] = location;
                done.countDown();
            }

            @Override
            public void onStatusChanged(String p, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String p) {
            }

            @Override
            public void onProviderDisabled(String p) {
            }
        };
        try {
            lm.requestSingleUpdate(provider, listener, Looper.getMainLooper());
            done.await(ONCE_MS, TimeUnit.MILLISECONDS);
        } catch (SecurityException | InterruptedException ignored) {
        } finally {
            try {
                lm.removeUpdates(listener);
            } catch (Exception ignored) {
            }
        }
        return box[0];
    }

    private String provider(LocationManager lm) {
        try {
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                return LocationManager.NETWORK_PROVIDER;
            }
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                return LocationManager.GPS_PROVIDER;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private Location readLastKnown() {
        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;
        try {
            Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            Location net = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (gps == null) return net;
            if (net == null) return gps;
            return gps.getTime() >= net.getTime() ? gps : net;
        } catch (SecurityException ignored) {
            return null;
        }
    }

    private static String toJson(Location loc) {
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
}
