package com.ocl.maintenance;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * Permission bridge for the WebView. Check-ins themselves run in {@link LocationService}
 * so they continue while the app is in the background.
 */
public class LocationHelper {
    static final int REQ_LOCATION = 4106;
    static final int REQ_BACKGROUND = 4108;
    static final int REQ_NOTIFICATION = 4109;

    private final MainActivity activity;

    LocationHelper(MainActivity activity) {
        this.activity = activity;
    }

    void start() {
        ensurePermission();
        if (hasPermission()) LocationService.start(activity);
    }

    void stop() {
        // The foreground service keeps the check-in alive after the activity leaves the screen.
    }

    boolean hasPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    void ensurePermission() {
        if (!hasPermission()) {
            ActivityCompat.requestPermissions(
                    activity,
                    new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    },
                    REQ_LOCATION
            );
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    activity,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQ_NOTIFICATION
            );
            return;
        }
        if (Build.VERSION.SDK_INT >= 29
                && ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    activity,
                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                    REQ_BACKGROUND
            );
        }
    }

    void onPermissionResult() {
        ensurePermission();
        if (hasPermission()) LocationService.start(activity);
    }

    void pingNow() {
        if (hasPermission()) LocationService.start(activity);
    }

    String lastLocationJson() {
        Location loc = LocationService.lastFix;
        if (loc == null && hasPermission()) {
            LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
            if (lm != null) {
                try {
                    Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                    Location net = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                    loc = gps == null ? net : net == null || gps.getTime() >= net.getTime() ? gps : net;
                } catch (SecurityException ignored) {
                    loc = null;
                }
            }
            if (loc != null) LocationService.lastFix = loc;
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
}
