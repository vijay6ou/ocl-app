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

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * Location only while this activity is on screen. No foreground service and no
 * persistent notification. Duty-window enforcement stays on the plant server.
 */
public class LocationHelper {
    static final int REQ_LOCATION = 4106;

    static volatile Location lastFix;

    private final MainActivity activity;
    private LocationListener listener;
    private boolean updatesRequested;

    LocationHelper(MainActivity activity) {
        this.activity = activity;
    }

    void start() {
        clearStaleTrackingNotice();
    }

    void onResume() {
        listen();
    }

    void stop() {
        stopListening();
    }

    boolean hasPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    void ensurePermission() {
        if (hasPermission()) {
            listen();
            return;
        }
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
        if (hasPermission()) listen();
    }

    void pingNow() {
        if (!hasPermission()) return;
        listen();
        Location loc = readLastKnown();
        if (loc != null) lastFix = loc;
    }

    String lastLocationJson() {
        Location loc = lastFix;
        if (loc == null) loc = readLastKnown();
        if (loc != null) lastFix = loc;
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

    private void clearStaleTrackingNotice() {
        NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(4107);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.deleteNotificationChannel("ocl_location");
        }
    }

    private void listen() {
        if (updatesRequested || !hasPermission()) return;
        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
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
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 60_000L, 0f, listener, Looper.getMainLooper());
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60_000L, 0f, listener, Looper.getMainLooper());
            }
            Location known = readLastKnown();
            if (known != null) lastFix = known;
            updatesRequested = true;
        } catch (SecurityException ignored) {
            updatesRequested = false;
        }
    }

    private void stopListening() {
        if (!updatesRequested || listener == null) return;
        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (lm != null) {
            try {
                lm.removeUpdates(listener);
            } catch (Exception ignored) {
            }
        }
        updatesRequested = false;
        listener = null;
    }

    private Location readLastKnown() {
        if (!hasPermission()) return null;
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
}
