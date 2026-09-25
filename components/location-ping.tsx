"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { msUntilNextPlantSlot, plantSlotKey } from "@/lib/submit-time";
import { isOclNative } from "@/lib/print-native";

function postFix(lat: number, lng: number, accuracy?: number) {
  return api<{ ok?: boolean; slot?: string }>("/api/location", {
    method: "POST",
    body: JSON.stringify({ lat, lng, accuracy }),
  }).catch(() => undefined);
}

function nativeHasPermission() {
  try {
    return Boolean(window.OCLNative?.hasLocationPermission?.());
  } catch {
    return false;
  }
}

function nativeCoords(): { lat: number; lng: number; accuracy?: number } | null {
  try {
    const raw = window.OCLNative?.getLocation?.();
    if (!raw) return null;
    const loc = JSON.parse(raw) as { lat?: unknown; lng?: unknown; accuracy?: unknown };
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const accuracy = loc.accuracy == null ? undefined : Number(loc.accuracy);
    return { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : undefined };
  } catch {
    return null;
  }
}

/**
 * 15-minute location check-ins. The Android WebView origin is HTTP, so
 * navigator.geolocation often reports denied even when ACCESS_FINE_LOCATION
 * is granted. Native LocationManager is the source of truth in the APK.
 * Never show a permission banner — the OS dialog is enough.
 */
export function LocationPing() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    if (isOclNative()) {
      try {
        window.OCLNative?.requestLocationPermission?.();
      } catch {
        /* optional */
      }
    }

    let lastSlot = "";
    function sendOnce() {
      const slot = plantSlotKey();
      if (lastSlot === slot) return;
      if (isOclNative() && nativeHasPermission()) {
        const loc = nativeCoords();
        if (loc) {
          void postFix(loc.lat, loc.lng, loc.accuracy).then((res) => {
            if (res?.ok) lastSlot = res.slot || slot;
          });
          return;
        }
        try {
          window.OCLNative?.pingLocationNow?.();
          lastSlot = slot;
        } catch {
          /* wait for a GPS fix */
        }
        return;
      }
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void postFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy).then(
            (res) => {
              if (res?.ok) lastSlot = res.slot || slot;
            }
          );
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
      );
    }

    sendOnce();
    let timer: number | null = null;
    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sendOnce();
        schedule();
      }, msUntilNextPlantSlot() + 400);
    }
    schedule();

    const poll = isOclNative()
      ? window.setInterval(() => {
          if (nativeHasPermission()) sendOnce();
        }, 15_000)
      : null;

    return () => {
      if (timer) window.clearTimeout(timer);
      if (poll) window.clearInterval(poll);
    };
  }, [user]);

  return null;
}
