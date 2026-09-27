import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { canSeeArea } from "@/lib/hierarchy";
import { getCatalogue, getEodNote, listEodNotes, upsertEodNote } from "@/lib/store";
import type { EodBlock, EodNote, ShiftCode } from "@/lib/types";
import { SHIFT_OPTIONS } from "@/lib/types";

export const dynamic = "force-dynamic";

const BLOCK_KINDS = new Set([
  "heading",
  "text",
  "bullets",
  "numbered",
  "checklist",
  "photo",
  "count",
  "time",
  "callout",
  "handover",
  "spoken",
]);

function tidyBlock(raw: EodBlock): EodBlock | null {
  if (!raw?.id || !BLOCK_KINDS.has(raw.kind)) return null;
  return {
    id: String(raw.id),
    kind: raw.kind,
    text: raw.text,
    items: raw.items
      ?.map((i) => ({
        id: String(i.id || crypto.randomUUID()),
        text: String(i.text ?? ""),
        done: Boolean(i.done),
      }))
      .filter((i) => i.id),
    photos: raw.photos?.filter((p) => p?.id).map((p) => ({
      id: p.id,
      equipmentId: p.equipmentId,
      commonId: p.commonId,
      kind: p.kind,
      checkIndex: p.checkIndex,
    })),
    label: raw.label,
    value: raw.value,
    unit: raw.unit,
    at: raw.at,
    tone: raw.tone === "urgent" || raw.tone === "info" || raw.tone === "warn" ? raw.tone : undefined,
    from: raw.from,
    to: raw.to,
  };
}

function tidyNote(body: Partial<EodNote>, user: { id: string; name: string }): EodNote {
  const shift = body.shift && SHIFT_OPTIONS.some((s) => s.code === body.shift) ? (body.shift as ShiftCode) : "";
  const date = String(body.date ?? "").slice(0, 10);
  return {
    id: body.id?.trim() || crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    submittedAt: body.submittedAt,
    status: body.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
    date,
    shift,
    techId: user.id,
    tech: user.name,
    plantId: body.plantId,
    plantName: body.plantName,
    sectionId: body.sectionId,
    sectionName: body.sectionName,
    areaId: body.areaId,
    areaName: body.areaName,
    blocks: (body.blocks ?? []).map(tidyBlock).filter((b): b is EodBlock => Boolean(b)),
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const [notes, catalogue] = await Promise.all([listEodNotes(), getCatalogue()]);
    const rows =
      user.role === "admin"
        ? notes
        : notes.filter(
            (n) =>
              n.techId === user.id ||
              (n.status === "SUBMITTED" && n.areaId && canSeeArea(user, catalogue, n.areaId))
          );
    return NextResponse.json({ notes: rows });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { note?: Partial<EodNote> };
    if (!body.note) return NextResponse.json({ error: "Handover note is required." }, { status: 400 });
    if (!body.note.date) return NextResponse.json({ error: "Pick the date of this shift." }, { status: 400 });
    const existing = body.note.id ? await getEodNote(body.note.id) : null;
    if (existing && existing.techId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "You can only edit your own handover." }, { status: 403 });
    }
    if (existing?.status === "SUBMITTED" && user.role !== "admin") {
      return NextResponse.json({ error: "This handover is already submitted." }, { status: 400 });
    }
    const note = tidyNote(
      {
        ...existing,
        ...body.note,
        status: "DRAFT",
        submittedAt: existing?.submittedAt,
        techId: existing?.techId ?? user.id,
        tech: existing?.tech ?? user.name,
      },
      { id: existing?.techId ?? user.id, name: existing?.tech ?? user.name }
    );
    const saved = await upsertEodNote(note);
    return NextResponse.json({ note: saved }, { status: existing ? 200 : 201 });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { note?: Partial<EodNote>; submit?: boolean };
    if (!body.note?.id) return NextResponse.json({ error: "Handover id is required." }, { status: 400 });
    const all = await listEodNotes();
    const existing = all.find((n) => n.id === body.note!.id);
    if (!existing) return NextResponse.json({ error: "Handover not found." }, { status: 404 });
    if (existing.techId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "You can only submit your own handover." }, { status: 403 });
    }
    const merged = tidyNote(
      { ...existing, ...body.note, id: existing.id, techId: existing.techId, tech: existing.tech },
      { id: existing.techId, name: existing.tech }
    );
    if (body.submit) {
      if (!merged.shift) {
        return NextResponse.json({ error: "Pick the shift before handing over." }, { status: 400 });
      }
      merged.status = "SUBMITTED";
      merged.submittedAt = new Date().toISOString();
    }
    const saved = await upsertEodNote(merged);
    return NextResponse.json({ note: saved });
  } catch (err) {
    return jsonError(err);
  }
}
