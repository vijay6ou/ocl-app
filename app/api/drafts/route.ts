import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { deleteDraft, getDraft, saveDraft } from "@/lib/store";
import type { CommonState, DayKey, DraftState, EquipState, ShiftCode } from "@/lib/types";
import { DAY_KEYS, SHIFT_OPTIONS } from "@/lib/types";

export const dynamic = "force-dynamic";

function isDayKey(value: string): value is DayKey {
  return (DAY_KEYS as readonly string[]).includes(value);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const day = new URL(req.url).searchParams.get("day") ?? "";
    if (!isDayKey(day)) {
      return NextResponse.json({ error: "Pick a plant section." }, { status: 400 });
    }
    const draft = await getDraft(user.id, day);
    return NextResponse.json({ draft });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      day?: DayKey;
      date?: string;
      shift?: ShiftCode | "";
      sup?: string;
      equip?: Record<string, EquipState>;
      common?: Record<string, CommonState>;
    };
    if (!body.day || !isDayKey(body.day)) {
      return NextResponse.json({ error: "Pick a plant section." }, { status: 400 });
    }
    if (body.shift && !SHIFT_OPTIONS.some((s) => s.code === body.shift)) {
      return NextResponse.json({ error: "Unknown shift." }, { status: 400 });
    }
    const draft: DraftState = {
      day: body.day,
      savedAt: new Date().toISOString(),
      meta: {
        date: (body.date ?? "").trim(),
        shift: body.shift ?? "G",
        sup: body.sup ?? "",
      },
      equip: body.equip ?? {},
      common: body.common ?? {},
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
    if (!isDayKey(day)) {
      return NextResponse.json({ error: "Pick a plant section." }, { status: 400 });
    }
    await deleteDraft(user.id, day);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
