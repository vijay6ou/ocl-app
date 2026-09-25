import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import {
  deleteSubmissionsByDateRange,
  getStorageUsage,
  previewDeleteByDateRange,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function dates(req: Request) {
  const url = new URL(req.url);
  const from = (url.searchParams.get("from") ?? "").trim();
  const to = (url.searchParams.get("to") ?? "").trim();
  return { from, to };
}

export async function GET(req: Request) {
  try {
    await requireRole("admin");
    const usage = await getStorageUsage();
    const { from, to } = dates(req);
    const preview =
      from && to ? await previewDeleteByDateRange(from, to) : null;
    return NextResponse.json({ usage, preview });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as { from?: string; to?: string; confirm?: string };
    const from = (body.from ?? "").trim();
    const to = (body.to ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json(
        { error: "Choose a from date and a to date." },
        { status: 400 }
      );
    }
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { error: "Type DELETE to confirm." },
        { status: 400 }
      );
    }
    const result = await deleteSubmissionsByDateRange(from, to);
    const usage = await getStorageUsage();
    return NextResponse.json({ ok: true, result, usage });
  } catch (err) {
    return jsonError(err);
  }
}
