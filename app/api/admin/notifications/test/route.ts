import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { sendAdminNotifyTest } from "@/lib/notify";
import { telegramPublicStatus } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json().catch(() => ({}))) as { dest?: string };
    const dest = body.dest;
    if (dest !== "discord" && dest !== "telegram" && dest !== "location") {
      return NextResponse.json({ error: "Choose reports, location, or Telegram." }, { status: 400 });
    }
    const result = await sendAdminNotifyTest(dest);
    const telegram = await telegramPublicStatus();
    return NextResponse.json({
      status: result.status,
      detail: result.detail,
      telegram,
    });
  } catch (err) {
    return jsonError(err);
  }
}
