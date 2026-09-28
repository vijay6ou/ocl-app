import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { canSeeArea } from "@/lib/hierarchy";
import { fillPlaceFromCatalogue, type PhotoPlace } from "@/lib/media-path";
import { getCatalogue, saveFileNote } from "@/lib/store";
import type { FileNoteKind } from "@/lib/file-docs";

export const dynamic = "force-dynamic";

const NOTE_MAX_CHARS = 80_000;
const KINDS = new Set<FileNoteKind>(["note", "log", "paste"]);

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      title?: string;
      body?: string;
      kind?: string;
      plantId?: string;
      plantName?: string;
      sectionId?: string;
      sectionName?: string;
      areaId?: string;
      areaName?: string;
      equipmentId?: string;
      equipmentTag?: string;
      equipmentName?: string;
      commonId?: string;
      commonTag?: string;
      commonName?: string;
      date?: string;
    };
    const text = String(body.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!text) {
      return NextResponse.json({ error: "Write the note first." }, { status: 400 });
    }
    if (text.length > NOTE_MAX_CHARS) {
      return NextResponse.json({ error: "That note is too long. Keep it under 80,000 characters." }, { status: 400 });
    }
    const kind: FileNoteKind = KINDS.has(body.kind as FileNoteKind) ? (body.kind as FileNoteKind) : "note";
    const title =
      String(body.title ?? "").trim() ||
      (kind === "log" ? "Log" : kind === "paste" ? "Pasted plant data" : "Note");
    const catalogue = await getCatalogue();
    const place: PhotoPlace = fillPlaceFromCatalogue(catalogue, {
      plantId: body.plantId,
      plantName: body.plantName,
      sectionId: body.sectionId,
      sectionName: body.sectionName,
      areaId: body.areaId,
      areaName: body.areaName,
      equipmentId: body.equipmentId,
      equipmentTag: body.equipmentTag,
      equipmentName: body.equipmentName,
      commonId: body.commonId,
      commonTag: body.commonTag,
      commonName: body.commonName,
      source: "album",
      date: body.date,
      techSlug: user.username,
    });
    if (place.areaId && user.role !== "admin" && !canSeeArea(user, catalogue, place.areaId)) {
      return NextResponse.json({ error: "You are not assigned to that area." }, { status: 403 });
    }
    if ((place.equipmentId || place.commonId) && !place.areaId && user.role !== "admin") {
      return NextResponse.json({ error: "That machine is not on your plant tree." }, { status: 403 });
    }
    const saved = await saveFileNote(
      {
        id: crypto.randomUUID(),
        title,
        body: text,
        kind,
        uploadedBy: user.id,
        uploadedAt: new Date().toISOString(),
        equipmentId: place.equipmentId,
        commonId: place.commonId,
      },
      place
    );
    return NextResponse.json({
      note: {
        id: saved.id,
        title: saved.title,
        kind: saved.kind,
        uploadedAt: saved.uploadedAt,
        relPath: saved.relPath,
        preview: saved.body.slice(0, 180),
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
