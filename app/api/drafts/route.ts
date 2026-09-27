import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { canSeeArea, canonicalAreaId } from "@/lib/hierarchy";
import { isSafeSectionId } from "@/lib/section-ids";
import { deleteDraft, getCatalogue, getDraft, saveDraft } from "@/lib/store";
import type { CommonState, DraftState, EquipState, PhotoRef, ShiftCode } from "@/lib/types";
import { SHIFT_OPTIONS } from "@/lib/types";

export const dynamic = "force-dynamic";

async function knownSection(day: string, user: Awaited<ReturnType<typeof requireUser>>) {
  if (!isSafeSectionId(day)) return false;
  const catalogue = await getCatalogue();
  const id = canonicalAreaId(day);
  if (!catalogue.days[id] && !catalogue.days[day]) return false;
  return canSeeArea(user, catalogue, id);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const day = new URL(req.url).searchParams.get("day") ?? "";
    if (!(await knownSection(day, user))) {
      return NextResponse.json({ error: "Pick a plant subsection." }, { status: 400 });
    }
    const draft = await getDraft(user.id, canonicalAreaId(day));
    return NextResponse.json({ draft });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      day?: string;
      date?: string;
      shift?: ShiftCode | "";
      sup?: string;
      equip?: Record<string, EquipState>;
      common?: Record<string, CommonState>;
      dayNotes?: string;
      dayPhotos?: PhotoRef[];
    };
    if (!body.day || !(await knownSection(body.day, user))) {
      return NextResponse.json({ error: "Pick a plant subsection." }, { status: 400 });
    }
    if (body.shift && !SHIFT_OPTIONS.some((s) => s.code === body.shift)) {
      return NextResponse.json({ error: "Unknown shift." }, { status: 400 });
    }
    const draft: DraftState = {
      day: canonicalAreaId(body.day),
      savedAt: new Date().toISOString(),
      meta: {
        date: (body.date ?? "").trim(),
        shift: body.shift ?? "G",
        sup: body.sup ?? "",
      },
      equip: body.equip ?? {},
      common: body.common ?? {},
      dayNotes: (body.dayNotes ?? "").trim(),
      dayPhotos: body.dayPhotos ?? [],
    };
    const saved = await saveDraft(user.id, draft);
    return NextResponse.json({ draft: saved });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const day = new URL(req.url).searchParams.get("day") ?? "";
    if (!(await knownSection(day, user))) {
      return NextResponse.json({ error: "Pick a plant subsection." }, { status: 400 });
    }
    await deleteDraft(user.id, canonicalAreaId(day));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
