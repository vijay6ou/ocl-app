import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { discoverTelegramChat, sendTelegramText, telegramPublicStatus } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin");
    const status = await telegramPublicStatus();
    return NextResponse.json({ telegram: status });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json().catch(() => ({}))) as { test?: boolean };
    const found = await discoverTelegramChat();
    let testSent = false;
    if (body.test && found) {
      const result = await sendTelegramText("Plant log test: Telegram is linked. Submit and day notes will come here.");
      testSent = result === "ok";
    }
    const status = await telegramPublicStatus();
    return NextResponse.json({ telegram: status, testSent });
  } catch (err) {
    return jsonError(err);
  }
}
