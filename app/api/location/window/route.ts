import { NextResponse } from "next/server";
import { getLocationWindow } from "@/lib/store";
import { isInsideLocationWindow } from "@/lib/location-window";

export const dynamic = "force-dynamic";

export async function GET() {
  const window = await getLocationWindow();
  return NextResponse.json({
    window,
    open: isInsideLocationWindow(window),
  });
}
