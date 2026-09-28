import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { PHOTO_MAX_BYTES } from "@/lib/constants";
import { canSeeArea } from "@/lib/hierarchy";
import { buildAlbumTree, fillPlaceFromCatalogue, locateEquipment, type PhotoPlace } from "@/lib/media-path";
import { getCatalogue, listFileNotes, listPhotos, savePhotoFile } from "@/lib/store";
import type { PhotoKind, PhotoMeta, PhotoSource } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS = new Set<PhotoKind>([
  "running",
  "stopped",
  "remark",
  "common",
  "selfie",
  "summary",
  "album",
  "nameplate",
]);

function formText(form: FormData, key: string) {
  const v = String(form.get(key) || "").trim();
  return v || undefined;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const [photos, notes, catalogue] = await Promise.all([listPhotos(), listFileNotes(), getCatalogue()]);
    if (url.searchParams.get("tree") === "1") {
      return NextResponse.json({ tree: buildAlbumTree(catalogue, photos, user, notes) });
    }
    const areaId = url.searchParams.get("areaId") ?? "";
    const equipmentId = url.searchParams.get("equipmentId") ?? "";
    let rows = photos.filter((p) => {
      if (p.kind === "selfie") return user.role === "admin" || p.uploadedBy === user.id;
      const located = locateEquipment(catalogue, p.equipmentId, p.commonId);
      const areaId = located?.areaId || p.areaId;
      if (!areaId) return user.role === "admin";
      return canSeeArea(user, catalogue, areaId);
    });
    if (areaId) rows = rows.filter((p) => p.areaId === areaId);
    if (equipmentId) rows = rows.filter((p) => p.equipmentId === equipmentId);
    rows.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return NextResponse.json({
      photos: rows.map((p) => ({
        ...p,
        url: `/api/photos/${p.id}`,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a photo of the defect." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files can be attached." }, { status: 400 });
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: "Photo is too large. Keep it under 8 MB." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const rawKind = String(form.get("kind") || "remark");
    const kind: PhotoKind = KINDS.has(rawKind as PhotoKind) ? (rawKind as PhotoKind) : "remark";
    const checkRaw = form.get("checkIndex");
    const sourceRaw = formText(form, "source");
    const source: PhotoSource | undefined =
      sourceRaw === "form" || sourceRaw === "album" || sourceRaw === "summary" ? sourceRaw : undefined;
    const catalogue = await getCatalogue();
    const place: PhotoPlace = fillPlaceFromCatalogue(catalogue, {
      plantId: formText(form, "plantId"),
      plantName: formText(form, "plantName"),
      sectionId: formText(form, "sectionId"),
      sectionName: formText(form, "sectionName"),
      areaId: formText(form, "areaId"),
      areaName: formText(form, "areaName"),
      equipmentId: formText(form, "equipmentId"),
      equipmentTag: formText(form, "equipmentTag"),
      equipmentName: formText(form, "equipmentName"),
      commonId: formText(form, "commonId"),
      commonTag: formText(form, "commonTag"),
      commonName: formText(form, "commonName"),
      source,
      date: formText(form, "date"),
      techSlug: user.username,
    });
    if (place.areaId && user.role !== "admin" && !canSeeArea(user, catalogue, place.areaId)) {
      return NextResponse.json({ error: "You are not assigned to that area." }, { status: 403 });
    }
    if ((place.equipmentId || place.commonId) && !place.areaId && user.role !== "admin") {
      return NextResponse.json({ error: "That machine is not on your plant tree." }, { status: 403 });
    }
    const meta: PhotoMeta = {
      id: crypto.randomUUID(),
      filename: file.name || "defect.jpg",
      mime: file.type || "image/jpeg",
      size: file.size,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
      equipmentId: place.equipmentId,
      commonId: place.commonId,
      kind,
      checkIndex: checkRaw === null || checkRaw === "" ? undefined : Number(checkRaw),
      plantId: place.plantId,
      plantName: place.plantName,
      sectionId: place.sectionId,
      sectionName: place.sectionName,
      areaId: place.areaId,
      areaName: place.areaName,
      equipmentTag: place.equipmentTag,
      equipmentName: place.equipmentName,
      commonTag: place.commonTag,
      commonName: place.commonName,
      source: place.source,
    };
    const saved = await savePhotoFile(meta, bytes, place);
    return NextResponse.json({
      photo: {
        id: saved.id,
        equipmentId: saved.equipmentId,
        commonId: saved.commonId,
        kind: saved.kind,
        checkIndex: saved.checkIndex,
        relPath: saved.relPath,
        url: `/api/photos/${saved.id}`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
