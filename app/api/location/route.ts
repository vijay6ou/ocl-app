import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { findLocationPing, saveLocationPing } from "@/lib/store";
import { buildLocationPing, notifyLocationDiscord } from "@/lib/location-notify";
import { plantSlotKey } from "@/lib/submit-time";

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
    const slot = plantSlotKey();
    const existing = await findLocationPing(user.id, slot);
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, slot: existing.slot });
    }
    const accuracy =
      body.accuracy == null || body.accuracy === "" ? undefined : Number(body.accuracy);
    const { ping, jpeg } = await buildLocationPing(
      user,
      lat,
      lng,
      Number.isFinite(accuracy) ? accuracy : undefined
    );
    const saved = await saveLocationPing(ping);
    const notify = await notifyLocationDiscord(saved, jpeg);
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
