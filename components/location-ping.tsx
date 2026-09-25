"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { msUntilNextPlantSlot } from "@/lib/submit-time";
import { isOclNative } from "@/lib/print-native";

function postFix(coords: GeolocationCoordinates) {
  return api("/api/location", {
    method: "POST",
    body: JSON.stringify({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
    }),
  }).catch(() => undefined);
}

export function LocationPing() {
  const { user } = useAuth();
  const [denied, setDenied] = useState(false);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastCoords = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;

    try {
      window.OCLNative?.requestLocationPermission?.();
    } catch {
      /* native optional */
    }

    function send(coords: GeolocationCoordinates) {
      lastCoords.current = coords;
      void postFix(coords);
    }

    function schedule() {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const cached = lastCoords.current;
        if (cached) void postFix(cached);
        else {
          navigator.geolocation.getCurrentPosition(
            (pos) => send(pos.coords),
            () => setDenied(true),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
          );
        }
        schedule();
      }, msUntilNextPlantSlot() + 400);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDenied(false);
        send(pos.coords);
        schedule();
      },
      () => {
        setDenied(true);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDenied(false);
        lastCoords.current = pos.coords;
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 60_000 }
    );

    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [user]);

  if (!user || !denied) return null;
  return (
    <div className="print:hidden border-b bg-amber-50 px-4 py-2 text-center text-xs text-amber-950">
      Plant check-in needs location permission. Enable it in the browser or app settings.
      {isOclNative() ? " The app will keep sending while it stays open." : ""}
      <button
        type="button"
        className="ml-2 font-semibold underline"
        onClick={() => {
          navigator.geolocation.getCurrentPosition(
            () => setDenied(false),
            () => setDenied(true)
          );
        }}
      >
        Try again
      </button>
    </div>
  );
}
