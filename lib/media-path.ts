import {
  canSeeArea,
  pathForArea,
  sectionsOfPlant,
} from "@/lib/hierarchy";
import type { FileNote } from "@/lib/file-docs";
import type { Catalogue, PhotoMeta, PublicUser } from "@/lib/types";

export type PhotoPlace = {
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
  source?: "form" | "album" | "summary";
  date?: string;
  techSlug?: string;
};

export function slugSegment(value: string): string {
  const s = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || "item";
}

export function assertSafeRelPath(rel: string): string {
  const parts = rel
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === ".." || p === "." || p.includes("\0"))) {
    throw new Error("Invalid media path.");
  }
  return parts.join("/");
}

export function equipmentFolder(id: string): string {
  const trimmed = id.trim();
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(trimmed)) return trimmed;
  return slugSegment(trimmed);
}

export function locateEquipment(
  catalogue: Catalogue,
  equipmentId?: string,
  commonId?: string
): {
  areaId: string;
  plantId?: string;
  plantName?: string;
  sectionId?: string;
  sectionName?: string;
  areaName?: string;
  equipmentId?: string;
  equipmentTag?: string;
  equipmentName?: string;
  commonId?: string;
  commonTag?: string;
  commonName?: string;
} | null {
  if (equipmentId) {
    for (const [areaId, day] of Object.entries(catalogue.days)) {
      const eq = day.equip.find((e) => e.id === equipmentId);
      if (!eq) continue;
      const path = pathForArea(catalogue, areaId);
      return {
        areaId: path.areaId,
        plantId: path.plant?.id,
        plantName: path.plant?.name,
        sectionId: path.section?.id,
        sectionName: path.section?.name,
        areaName: path.area?.label,
        equipmentId: eq.id,
        equipmentTag: eq.tag,
        equipmentName: eq.name,
      };
    }
  }
  if (commonId) {
    for (const [areaId, day] of Object.entries(catalogue.days)) {
      for (const group of day.common) {
        const item = group.items.find((i) => i.id === commonId);
        if (!item) continue;
        const path = pathForArea(catalogue, areaId);
        return {
          areaId: path.areaId,
          plantId: path.plant?.id,
          plantName: path.plant?.name,
          sectionId: path.section?.id,
          sectionName: path.section?.name,
          areaName: path.area?.label,
          commonId: item.id,
          commonTag: item.tag,
          commonName: item.device,
        };
      }
    }
  }
  return null;
}

export function extForPhoto(filename: string, mime: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export function mediaRelPath(
  place: PhotoPlace,
  meta: { id: string; filename: string; mime: string; kind: string }
): string {
  const date = (place.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "") ||
    new Date().toISOString().slice(0, 10);
  const short = meta.id.replace(/-/g, "").slice(0, 8);
  const ext = extForPhoto(meta.filename, meta.mime);
  const kind = slugSegment(meta.kind);

  if (meta.kind === "selfie") {
    const tech = slugSegment(place.techSlug || "tech");
    return `_selfies/${date}/${tech}/${date}-selfie-${short}.${ext}`;
  }

  const plant = slugSegment(place.plantId || place.plantName || "plant");
  const section = slugSegment(place.sectionId || place.sectionName || "section");
  const area = slugSegment(place.areaId || place.areaName || "area");

  if (place.commonId) {
    const folder = equipmentFolder(place.commonId);
    return `${plant}/${section}/${area}/_common/${folder}/${date}-${kind}-${short}.${ext}`;
  }

  if (place.equipmentId) {
    const folder = equipmentFolder(place.equipmentId);
    return `${plant}/${section}/${area}/${folder}/${date}-${kind}-${short}.${ext}`;
  }

  return `${plant}/${section}/${area}/_shift-notes/${date}/${date}-${kind}-${short}.${ext}`;
}

export function noteRelPath(
  place: PhotoPlace,
  meta: { id: string; kind: string; title?: string }
): string {
  const date = (place.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "") ||
    new Date().toISOString().slice(0, 10);
  const short = meta.id.replace(/-/g, "").slice(0, 8);
  const kind = slugSegment(meta.kind || "note");
  const plant = slugSegment(place.plantId || place.plantName || "plant");
  const section = slugSegment(place.sectionId || place.sectionName || "section");
  const area = slugSegment(place.areaId || place.areaName || "area");
  if (place.commonId) {
    const folder = equipmentFolder(place.commonId);
    return `${plant}/${section}/${area}/_common/${folder}/${date}-${kind}-${short}.txt`;
  }
  if (place.equipmentId) {
    const folder = equipmentFolder(place.equipmentId);
    return `${plant}/${section}/${area}/${folder}/${date}-${kind}-${short}.txt`;
  }
  return `${plant}/${section}/${area}/_shift-notes/${date}/${date}-${kind}-${short}.txt`;
}

export function fillPlaceFromCatalogue(catalogue: Catalogue, place: PhotoPlace): PhotoPlace {
  const located = locateEquipment(catalogue, place.equipmentId, place.commonId);
  const areaId = located?.areaId || place.areaId;
  const path = areaId ? pathForArea(catalogue, areaId) : null;
  return {
    ...place,
    plantId: place.plantId || located?.plantId || path?.plant?.id,
    plantName: place.plantName || located?.plantName || path?.plant?.name,
    sectionId: place.sectionId || located?.sectionId || path?.section?.id,
    sectionName: place.sectionName || located?.sectionName || path?.section?.name,
    areaId: located?.areaId || path?.areaId || place.areaId,
    areaName: place.areaName || located?.areaName || path?.area?.label,
    equipmentId: located?.equipmentId || place.equipmentId,
    equipmentTag: place.equipmentTag || located?.equipmentTag,
    equipmentName: place.equipmentName || located?.equipmentName,
    commonId: located?.commonId || place.commonId,
    commonTag: place.commonTag || located?.commonTag,
    commonName: place.commonName || located?.commonName,
  };
}

export type AlbumFile = {
  id: string;
  filename: string;
  kind: PhotoMeta["kind"];
  uploadedAt: string;
  uploadedBy: string;
  url: string;
};

export type AlbumNote = {
  id: string;
  title: string;
  kind: FileNote["kind"];
  uploadedAt: string;
  preview: string;
};

export type AlbumEquipment = {
  key: string;
  equipmentId?: string;
  tag: string;
  name: string;
  photoCount: number;
  noteCount: number;
  itemCount: number;
  photos: AlbumFile[];
  notes: AlbumNote[];
};

export type AlbumArea = {
  areaId: string;
  label: string;
  photoCount: number;
  noteCount: number;
  itemCount: number;
  equipment: AlbumEquipment[];
};

export type AlbumSection = {
  sectionId: string;
  name: string;
  photoCount: number;
  noteCount: number;
  itemCount: number;
  areas: AlbumArea[];
};

export type AlbumPlant = {
  plantId: string;
  name: string;
  photoCount: number;
  noteCount: number;
  itemCount: number;
  sections: AlbumSection[];
};

function asFile(photo: PhotoMeta): AlbumFile {
  return {
    id: photo.id,
    filename: photo.filename,
    kind: photo.kind,
    uploadedAt: photo.uploadedAt,
    uploadedBy: photo.uploadedBy,
    url: `/api/photos/${photo.id}`,
  };
}

function photoAreaId(catalogue: Catalogue, photo: PhotoMeta | FileNote) {
  return locateEquipment(catalogue, photo.equipmentId, photo.commonId)?.areaId || photo.areaId;
}

function photoVisible(photo: PhotoMeta | FileNote, catalogue: Catalogue, user: PublicUser) {
  if ("kind" in photo && photo.kind === "selfie") return user.role === "admin" || photo.uploadedBy === user.id;
  const areaId = photoAreaId(catalogue, photo);
  if (!areaId) return user.role === "admin";
  return canSeeArea(user, catalogue, areaId);
}

function emptyEquipRow(partial: Omit<AlbumEquipment, "photoCount" | "noteCount" | "itemCount" | "photos" | "notes">): AlbumEquipment {
  return {
    ...partial,
    photoCount: 0,
    noteCount: 0,
    itemCount: 0,
    photos: [],
    notes: [],
  };
}

function fileKey(
  catalogue: Catalogue,
  item: { equipmentId?: string; commonId?: string }
) {
  const located = locateEquipment(catalogue, item.equipmentId, item.commonId);
  if (located?.equipmentId) return located.equipmentId;
  if (located?.commonId) return `common:${located.commonId}`;
  if (item.equipmentId) return item.equipmentId;
  if (item.commonId) return `common:${item.commonId}`;
  return "_shift-notes";
}

export function buildAlbumTree(
  catalogue: Catalogue,
  photos: PhotoMeta[],
  user: PublicUser,
  notes: FileNote[] = []
): AlbumPlant[] {
  const visible = photos.filter((p) => photoVisible(p, catalogue, user));
  const visibleNotes = notes.filter((n) => photoVisible(n, catalogue, user));

  const plants: AlbumPlant[] = [];

  for (const plant of catalogue.plants) {
    const sections: AlbumSection[] = [];
    for (const section of sectionsOfPlant(catalogue, plant.id)) {
      const areas: AlbumArea[] = [];
      for (const areaId of section.areaIds) {
        if (!canSeeArea(user, catalogue, areaId)) continue;
        const day = catalogue.days[areaId];
        const areaPhotos = visible.filter(
          (p) => p.kind !== "selfie" && photoAreaId(catalogue, p) === areaId
        );
        const areaNotes = visibleNotes.filter((n) => photoAreaId(catalogue, n) === areaId);
        const equipMap = new Map<string, AlbumEquipment>();

        for (const eq of day?.equip ?? []) {
          equipMap.set(eq.id, emptyEquipRow({
            key: eq.id,
            equipmentId: eq.id,
            tag: eq.tag,
            name: eq.name,
          }));
        }
        for (const item of day?.common.flatMap((g) => g.items) ?? []) {
          const key = `common:${item.id}`;
          equipMap.set(key, emptyEquipRow({
            key,
            tag: item.tag,
            name: item.device,
          }));
        }

        const notesKey = "_shift-notes";
        function ensureRow(
          item: { equipmentId?: string; commonId?: string; equipmentTag?: string; equipmentName?: string; commonTag?: string; commonName?: string }
        ) {
          const located = locateEquipment(catalogue, item.equipmentId, item.commonId);
          const key = fileKey(catalogue, item);
          let row = equipMap.get(key);
          if (!row) {
            row = emptyEquipRow({
              key,
              equipmentId: located?.equipmentId || item.equipmentId,
              tag: located?.equipmentTag || located?.commonTag || item.equipmentTag || item.commonTag || (key === notesKey ? "NOTES" : key),
              name:
                located?.equipmentName ||
                located?.commonName ||
                item.equipmentName ||
                item.commonName ||
                (key === notesKey ? "Notes for this area" : "Other files"),
            });
            equipMap.set(key, row);
          }
          return row;
        }

        for (const photo of areaPhotos) {
          const row = ensureRow(photo);
          row.photos.push(asFile(photo));
          row.photoCount += 1;
          row.itemCount += 1;
        }
        for (const note of areaNotes) {
          const row = ensureRow(note);
          row.notes.push({
            id: note.id,
            title: note.title,
            kind: note.kind,
            uploadedAt: note.uploadedAt,
            preview: note.body.slice(0, 180),
          });
          row.noteCount += 1;
          row.itemCount += 1;
        }

        for (const row of equipMap.values()) {
          row.photos.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
          row.notes.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        }

        const equipment = [...equipMap.values()].sort((a, b) => {
          if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
          return a.name.localeCompare(b.name);
        });
        const photoCount = equipment.reduce((n, e) => n + e.photoCount, 0);
        const noteCount = equipment.reduce((n, e) => n + e.noteCount, 0);
        areas.push({
          areaId,
          label: day?.label ?? areaId,
          photoCount,
          noteCount,
          itemCount: photoCount + noteCount,
          equipment,
        });
      }
      const photoCount = areas.reduce((n, a) => n + a.photoCount, 0);
      const noteCount = areas.reduce((n, a) => n + a.noteCount, 0);
      if (areas.length) {
        sections.push({
          sectionId: section.id,
          name: section.name,
          photoCount,
          noteCount,
          itemCount: photoCount + noteCount,
          areas,
        });
      }
    }
    const photoCount = sections.reduce((n, s) => n + s.photoCount, 0);
    const noteCount = sections.reduce((n, s) => n + s.noteCount, 0);
    if (sections.length) {
      plants.push({
        plantId: plant.id,
        name: plant.name,
        photoCount,
        noteCount,
        itemCount: photoCount + noteCount,
        sections,
      });
    }
  }

  return plants;
}

export function isAlbumPhoto(meta: PhotoMeta) {
  return Boolean(meta.relPath) && meta.kind !== "selfie";
}
