import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { getLocationWindow, saveLocationWindow } from "@/lib/store";
import {
  isInsideLocationWindow,
  normalizeLocationWindow,
  parseClock,
  type LocationWindow,
} from "@/lib/location-window";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin");
    const window = await getLocationWindow();
    return NextResponse.json({ window, open: isInsideLocationWindow(window) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as Partial<LocationWindow>;
    const window = normalizeLocationWindow(body);
    if (parseClock(window.start) === parseClock(window.end)) {
      return NextResponse.json(
        { error: "Start and end need to be different times." },
        { status: 400 }
      );
    }
    const saved = await saveLocationWindow({
      ...window,
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ window: saved, open: isInsideLocationWindow(saved) });
  } catch (err) {
    return jsonError(err);
  }
}
