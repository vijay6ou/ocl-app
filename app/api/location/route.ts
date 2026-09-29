import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { findLocationPing, getLocationWindow, getNotifySettings, saveLocationPing } from "@/lib/store";
import { fetchSatelliteJpeg, mapsSatelliteUrl, notifyLocationDiscord } from "@/lib/location-notify";
import { isInsideLocationWindow } from "@/lib/location-window";
import { shouldSendLocation } from "@/lib/notify-settings";
import { plantSlotKey } from "@/lib/submit-time";
import type { LocationPing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { lat?: unknown; lng?: unknown; accuracy?: unknown };
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: "Coordinates are required." }, { status: 400 });
    }
    const window = await getLocationWindow();
    if (!isInsideLocationWindow(window)) {
      return NextResponse.json({
        ok: true,
        skipped: "outside-window",
        window,
      });
    }
    const slot = plantSlotKey();
    const existing = await findLocationPing(user.id, slot);
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, slot: existing.slot });
    }
    const accuracy =
      body.accuracy == null || body.accuracy === "" ? undefined : Number(body.accuracy);
    const settings = await getNotifySettings();
    const send = shouldSendLocation(settings);
    const jpeg = send && settings.payload.satelliteImage ? await fetchSatelliteJpeg(lat, lng) : null;
    const ping: LocationPing = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      lat,
      lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
      slot,
      recordedAt: new Date().toISOString(),
      mapUrl: mapsSatelliteUrl(lat, lng),
      satelliteAttached: Boolean(jpeg),
    };
    const saved = await saveLocationPing(ping);
    const notify = send ? await notifyLocationDiscord(saved, jpeg) : { status: "skipped" as const };
    return NextResponse.json({
      ok: true,
      slot: saved.slot,
      satellite: saved.satelliteAttached,
      notified: notify.status,
    });
  } catch (err) {
    return jsonError(err);
  }
}
