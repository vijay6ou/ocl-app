import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { listPresenceSessions } from "@/lib/store";
import { summarizePresence } from "@/lib/presence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin");
    const sessions = await listPresenceSessions();
    return NextResponse.json(summarizePresence(sessions));
  } catch (err) {
    return jsonError(err);
  }
}
