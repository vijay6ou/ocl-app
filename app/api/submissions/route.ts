import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { notifySubmission } from "@/lib/notify";
import { canSeeArea, canonicalAreaId, pathForArea } from "@/lib/hierarchy";
import { isSafeSectionId } from "@/lib/section-ids";
import { historyFilterFrom, queryVisibleSubmissions } from "@/lib/record-query";
import { getCatalogue, getPhoto, saveSubmission, verifyPin } from "@/lib/store";
import type {
  CommonState,
  EquipState,
  PhotoRef,
  ShiftCode,
  Submission,
} from "@/lib/types";
import { SHIFT_OPTIONS } from "@/lib/types";
import { deriveFails, isComplete, progressForDay } from "@/lib/progress";

export const dynamic = "force-dynamic";

function shiftLabel(code: ShiftCode) {
  return SHIFT_OPTIONS.find((s) => s.code === code)?.label ?? code;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const rows = await queryVisibleSubmissions(user, historyFilterFrom(url));

    return NextResponse.json({
      submissions: rows.map((r) => ({
        id: r.id,
        savedAt: r.savedAt,
        submittedAt: r.submittedAt || r.savedAt,
        status: r.status,
        meta: r.meta,
        failCount: r.fails.length,
        fails: r.fails,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      day?: string;
      date?: string;
      shift?: ShiftCode;
      sup?: string;
      equip?: Record<string, EquipState>;
      common?: Record<string, CommonState>;
      selfieId?: string;
      pin?: string;
      dayNotes?: string;
      dayPhotos?: PhotoRef[];
    };

    const dayKey = body.day?.trim() ?? "";
    if (!isSafeSectionId(dayKey)) {
      return NextResponse.json({ error: "Pick a plant subsection." }, { status: 400 });
    }
    const date = body.date?.trim() ?? "";
    const shift = body.shift;
    if (!date || !shift) {
      return NextResponse.json(
        { error: "Date and shift are required before you can archive this round." },
        { status: 400 }
      );
    }
    if (!SHIFT_OPTIONS.some((s) => s.code === shift)) {
      return NextResponse.json({ error: "Unknown shift." }, { status: 400 });
    }

    const selfieId = (body.selfieId ?? "").trim();
    const pin = (body.pin ?? "").trim();
    let selfie: PhotoRef | undefined;
    if (selfieId) {
      const selfiePhoto = await getPhoto(selfieId);
      if (!selfiePhoto || selfiePhoto.meta.uploadedBy !== user.id || selfiePhoto.meta.kind !== "selfie") {
        return NextResponse.json(
          { error: "The submit selfie is missing. Take it again on the front camera." },
          { status: 400 }
        );
      }
      selfie = { id: selfieId, kind: "selfie" };
    } else if (pin) {
      const pinCheck = await verifyPin(user.id, pin);
      if (!pinCheck.ok) {
        return NextResponse.json({ error: pinCheck.error }, { status: 401 });
      }
    } else {
      return NextResponse.json(
        { error: "Confirm with a selfie or your 4-digit PIN." },
        { status: 400 }
      );
    }

    const catalogue = await getCatalogue();
    const resolvedKey = canonicalAreaId(dayKey);
    const day = catalogue.days[resolvedKey] ?? catalogue.days[dayKey];
    if (!day) {
      return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
    }
    if (!canSeeArea(user, catalogue, resolvedKey)) {
      return NextResponse.json({ error: "You are not assigned to this area." }, { status: 403 });
    }
    const trail = pathForArea(catalogue, resolvedKey);
    const equip = body.equip ?? {};
    const common = body.common ?? {};
    const progress = progressForDay(day, equip, common);
    const fails = deriveFails(day, equip, common);
    const complete = isComplete(day, equip, common);

    const submittedAt = new Date().toISOString();
    const record: Submission = {
      id: `R${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`,
      savedAt: submittedAt,
      submittedAt,
      status: complete ? "COMPLETE" : "PENDING",
      meta: {
        date,
        shift,
        shiftLabel: shiftLabel(shift),
        techId: user.id,
        tech: user.name,
        sup: (body.sup ?? "").trim(),
        form: day.formLabel,
        day: resolvedKey,
        dayLabel: day.label,
        plantId: trail.plant?.id,
        plantName: trail.plant?.name,
        sectionId: trail.section?.id,
        sectionName: trail.section?.name,
        areaId: resolvedKey,
        areaName: day.label,
        pct: progress.pct,
        done: progress.done,
        total: progress.total,
      },
      equip,
      common,
      fails,
      snapshot: {
        label: day.label,
        formLabel: day.formLabel,
        equip: day.equip,
        common: day.common,
      },
      selfie,
      dayNotes: (body.dayNotes ?? "").trim(),
      dayPhotos: body.dayPhotos ?? [],
    };

    await saveSubmission(record);
    let notify;
    try {
      notify = await notifySubmission(record);
    } catch {
      notify = {
        discord: "failed" as const,
        telegram: "failed" as const,
        warning: "Record saved on the plant server. Discord delivery failed.",
      };
    }
    return NextResponse.json({ submission: record, notify }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
