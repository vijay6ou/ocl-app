"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { msUntilNextPlantSlot, plantSlotKey } from "@/lib/submit-time";
import type { LocationWindow } from "@/lib/location-window";
import { isOclNative } from "@/lib/print-native";

async function dutyWindowOpen() {
  try {
    const data = await api<{ window: LocationWindow; open: boolean }>("/api/location/window");
    return data.open;
  } catch {
    return true;
  }
}

function postFix(lat: number, lng: number, accuracy?: number) {
  return api<{ ok?: boolean; slot?: string }>("/api/location", {
    method: "POST",
    body: JSON.stringify({ lat, lng, accuracy }),
  }).catch(() => undefined);
}

function nativeFix(): { lat: number; lng: number; accuracy?: number } | null {
  try {
    if (!window.OCLNative?.hasLocationPermission?.()) return null;
    const raw = window.OCLNative.getLocation?.();
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
 * One Discord location ping per 15-minute plant slot while signed in.
 * Native capture is a single short fix, then GPS is released. No permission
 * dialog and no background listener.
 */
export function LocationPing() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let lastSlot = "";
    async function sendOnce() {
      const open = await dutyWindowOpen();
      if (!open) return;
      const slot = plantSlotKey();
      if (lastSlot === slot) return;
      if (isOclNative()) {
        const loc = nativeFix();
        if (!loc) return;
        void postFix(loc.lat, loc.lng, loc.accuracy).then((res) => {
          if (res?.ok) lastSlot = res.slot || slot;
        });
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
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 120000 }
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

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [user]);

  return null;
}
