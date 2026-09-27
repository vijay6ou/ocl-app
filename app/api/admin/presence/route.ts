import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { getLocationWindow, latestLocationByUser, listPresenceSessions } from "@/lib/store";
import { summarizePresence } from "@/lib/presence";
import { isInsideLocationWindow } from "@/lib/location-window";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin");
    const [sessions, window, latest] = await Promise.all([
      listPresenceSessions(),
      getLocationWindow(),
      latestLocationByUser(),
    ]);
    const open = isInsideLocationWindow(window);
    const locations: Record<
      string,
      { lat: number; lng: number; accuracy?: number; recordedAt: string; mapUrl: string; slot: string }
    > = {};
    if (open) {
      for (const [userId, ping] of Object.entries(latest)) {
        if (!isInsideLocationWindow(window, new Date(ping.recordedAt))) continue;
        locations[userId] = {
          lat: ping.lat,
          lng: ping.lng,
          accuracy: ping.accuracy,
          recordedAt: ping.recordedAt,
          mapUrl: ping.mapUrl,
          slot: ping.slot,
        };
      }
    }
    return NextResponse.json({
      ...summarizePresence(sessions),
      window,
      windowOpen: open,
      locations,
    });
  } catch (err) {
    return jsonError(err);
  }
}
