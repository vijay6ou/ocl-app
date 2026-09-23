import { NextResponse } from "next/server";
import { jsonError, logoutCurrent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await logoutCurrent();
    const accept = req.headers.get("accept") ?? "";
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded") || accept.includes("text/html")) {
      const host = req.headers.get("host") ?? new URL(req.url).host;
      const proto = req.headers.get("x-forwarded-proto") ?? "http";
      return NextResponse.redirect(`${proto}://${host}/login`, 303);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
