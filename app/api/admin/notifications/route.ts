import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { getNotifySettings, saveNotifySettings } from "@/lib/store";
import { normalizeNotifySettings } from "@/lib/notify-settings";
import { telegramPublicStatus } from "@/lib/telegram";
import { promises as fs } from "fs";
import path from "path";
import { sanitizePublicText } from "@/lib/public-text";

export const dynamic = "force-dynamic";

async function lastNotify() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "notify-last.json"), "utf8");
    const data = JSON.parse(raw) as {
      at?: string;
      recordId?: string;
      date?: string;
      discord?: string;
      telegram?: string;
      warning?: string;
    };
    return {
      at: data.at,
      recordId: data.recordId,
      date: data.date,
      discord: data.discord,
      telegram: data.telegram,
      warning: data.warning ? sanitizePublicText(data.warning) : undefined,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await requireRole("admin");
    const [settings, telegram, last] = await Promise.all([
      getNotifySettings(),
      telegramPublicStatus(),
      lastNotify(),
    ]);
    return NextResponse.json({
      settings,
      channels: {
        discordReports: { configured: Boolean((process.env.DISCORD_WEBHOOK_URL ?? "").trim()) },
        discordLocation: { configured: Boolean((process.env.LOCATION_DISCORD_WEBHOOK_URL ?? "").trim()) },
        telegram,
      },
      last,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as { settings?: unknown };
    const settings = await saveNotifySettings(normalizeNotifySettings(body.settings));
    const telegram = await telegramPublicStatus();
    return NextResponse.json({
      settings,
      channels: {
        discordReports: { configured: Boolean((process.env.DISCORD_WEBHOOK_URL ?? "").trim()) },
        discordLocation: { configured: Boolean((process.env.LOCATION_DISCORD_WEBHOOK_URL ?? "").trim()) },
        telegram,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
