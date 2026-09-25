import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { heartbeatPresence } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    const session = await heartbeatPresence(user);
    return NextResponse.json({
      ok: true,
      lastSeenAt: session.lastSeenAt,
      signedInAt: session.startedAt,
    });
  } catch (err) {
    return jsonError(err);
  }
}
