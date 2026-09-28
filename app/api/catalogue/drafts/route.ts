import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { deleteCatalogueDraft, getCatalogue, getCatalogueDraft, saveCatalogueDraft } from "@/lib/store";
import { isSafeSectionId } from "@/lib/section-ids";
import type { DayCatalogue } from "@/lib/types";

export const dynamic = "force-dynamic";

function asDraftSection(raw: unknown): DayCatalogue {
  if (!raw || typeof raw !== "object") {
    throw new Error("Draft is empty.");
  }
  const d = raw as DayCatalogue;
  return {
    label: String(d.label ?? ""),
    formLabel: String(d.formLabel ?? ""),
    badge: d.badge,
    blurb: d.blurb,
    equip: Array.isArray(d.equip) ? d.equip : [],
    common: Array.isArray(d.common) ? d.common : [],
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireRole("admin");
    const areaId = new URL(req.url).searchParams.get("areaId") ?? "";
    if (!isSafeSectionId(areaId)) {
      return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
    }
    const catalogue = await getCatalogue();
    if (!catalogue.days[areaId]) {
      return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
    }
    const draft = await getCatalogueDraft(areaId);
    return NextResponse.json({ draft, publishedAt: catalogue.updatedAt, admin: user.username });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireRole("admin");
    const body = (await req.json()) as { areaId?: string; section?: unknown };
    const areaId = String(body.areaId ?? "").trim();
    if (!isSafeSectionId(areaId)) {
      return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
    }
    const catalogue = await getCatalogue();
    if (!catalogue.days[areaId]) {
      return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
    }
    const section = asDraftSection(body.section);
    const draft = await saveCatalogueDraft({
      areaId,
      section,
      savedAt: new Date().toISOString(),
      savedBy: user.id,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole("admin");
    const areaId = new URL(req.url).searchParams.get("areaId") ?? "";
    if (!isSafeSectionId(areaId)) {
      return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
    }
    await deleteCatalogueDraft(areaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
