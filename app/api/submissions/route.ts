import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { notifySubmission } from "@/lib/notify";
import { getCatalogue, getPhoto, listSubmissions, saveSubmission, verifyPin } from "@/lib/store";
import { DAY_KEYS } from "@/lib/types";
import type {
  CommonState,
  DayKey,
  EquipState,
  ShiftCode,
  Submission,
} from "@/lib/types";
import { SHIFT_OPTIONS } from "@/lib/types";
import { deriveFails, isComplete, progressForDay } from "@/lib/progress";
import { defaultHistoryRange, recordInDateRange } from "@/lib/submit-time";

export const dynamic = "force-dynamic";

function shiftLabel(code: ShiftCode) {
  return SHIFT_OPTIONS.find((s) => s.code === code)?.label ?? code;
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const day = url.searchParams.get("day");
    const shift = url.searchParams.get("shift");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const failures = url.searchParams.get("failures") === "1";

    let rows = await listSubmissions();
    const range = defaultHistoryRange();
    const fromDate = from && from.trim() ? from : range.from;
    const toDate = to && to.trim() ? to : range.to;
    rows = rows.filter((r) => recordInDateRange(r, fromDate, toDate));
    if (day && (DAY_KEYS as readonly string[]).includes(day)) {
      rows = rows.filter((r) => r.meta.day === day);
    }
    if (shift) rows = rows.filter((r) => r.meta.shift === shift);
    if (failures) rows = rows.filter((r) => r.fails.length > 0);
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.meta.tech,
          r.meta.sup,
          r.meta.dayLabel,
          r.meta.form,
          r.id,
          ...r.fails.map((f) => `${f.equipment} ${f.issue}`),
          ...Object.values(r.equip).map((e) => e.remarks),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

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
      day?: DayKey;
      date?: string;
      shift?: ShiftCode;
      sup?: string;
      equip?: Record<string, EquipState>;
      common?: Record<string, CommonState>;
      selfieId?: string;
      pin?: string;
    };

    const dayKey = body.day;
    if (!dayKey || !(DAY_KEYS as readonly string[]).includes(dayKey)) {
      return NextResponse.json(
        { error: "Pick a plant section (Monday–Saturday)." },
        { status: 400 }
      );
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
    if (!selfieId) {
      return NextResponse.json(
        { error: "Take a selfie on the front camera before submitting." },
        { status: 400 }
      );
    }
    const selfiePhoto = await getPhoto(selfieId);
    if (!selfiePhoto || selfiePhoto.meta.uploadedBy !== user.id || selfiePhoto.meta.kind !== "selfie") {
      return NextResponse.json(
        { error: "The submit selfie is missing. Take it again on the front camera." },
        { status: 400 }
      );
    }
    const pinCheck = await verifyPin(user.id, body.pin ?? "");
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error }, { status: 401 });
    }

    const catalogue = await getCatalogue();
    const day = catalogue.days[dayKey];
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
        day: dayKey,
        dayLabel: day.label,
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
      selfie: { id: selfieId, kind: "selfie" },
    };

    await saveSubmission(record);
    let notify;
    try {
      notify = await notifySubmission(record);
    } catch {
      notify = {
        discord: "failed" as const,
        warning: "Record saved on the plant server. Discord delivery failed.",
      };
    }
    return NextResponse.json({ submission: record, notify }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
