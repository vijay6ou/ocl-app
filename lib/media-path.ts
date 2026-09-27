import {
  canSeeArea,
  pathForArea,
  sectionsOfPlant,
} from "@/lib/hierarchy";
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
  source?: "form" | "eod" | "album";
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

  if (place.commonId || place.commonTag) {
    const folder = slugSegment(place.commonTag || place.commonId || "common");
    return `${plant}/${section}/${area}/_common/${folder}/${date}-${kind}-${short}.${ext}`;
  }

  if (place.equipmentId || place.equipmentTag) {
    const folder = slugSegment(place.equipmentTag || place.equipmentId || "equip");
    return `${plant}/${section}/${area}/${folder}/${date}-${kind}-${short}.${ext}`;
  }

  return `${plant}/${section}/${area}/_shift-notes/${date}/${date}-${kind}-${short}.${ext}`;
}

export function fillPlaceFromCatalogue(catalogue: Catalogue, place: PhotoPlace): PhotoPlace {
  if (!place.areaId) return place;
  const path = pathForArea(catalogue, place.areaId);
  return {
    ...place,
    plantId: place.plantId || path.plant?.id,
    plantName: place.plantName || path.plant?.name,
    sectionId: place.sectionId || path.section?.id,
    sectionName: place.sectionName || path.section?.name,
    areaId: path.areaId,
    areaName: place.areaName || path.area?.label,
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

export type AlbumEquipment = {
  key: string;
  equipmentId?: string;
  tag: string;
  name: string;
  photoCount: number;
  photos: AlbumFile[];
};

export type AlbumArea = {
  areaId: string;
  label: string;
  photoCount: number;
  equipment: AlbumEquipment[];
};

export type AlbumSection = {
  sectionId: string;
  name: string;
  photoCount: number;
  areas: AlbumArea[];
};

export type AlbumPlant = {
  plantId: string;
  name: string;
  photoCount: number;
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

function equipKey(photo: PhotoMeta) {
  if (photo.commonId || photo.commonTag) {
    return `common:${photo.commonId || slugSegment(photo.commonTag || "common")}`;
  }
  return photo.equipmentId || slugSegment(photo.equipmentTag || "equip");
}

export function buildAlbumTree(
  catalogue: Catalogue,
  photos: PhotoMeta[],
  user: PublicUser
): AlbumPlant[] {
  const visible = photos.filter((p) => {
    if (p.kind === "selfie") return user.role === "admin" || p.uploadedBy === user.id;
    const areaId = p.areaId;
    if (!areaId) return user.role === "admin";
    return canSeeArea(user, catalogue, areaId);
  });

  const plants: AlbumPlant[] = [];

  for (const plant of catalogue.plants) {
    const sections: AlbumSection[] = [];
    for (const section of sectionsOfPlant(catalogue, plant.id)) {
      const areas: AlbumArea[] = [];
      for (const areaId of section.areaIds) {
        if (!canSeeArea(user, catalogue, areaId)) continue;
        const day = catalogue.days[areaId];
        const areaPhotos = visible.filter((p) => p.areaId === areaId && p.kind !== "selfie");
        const equipMap = new Map<string, AlbumEquipment>();

        for (const eq of day?.equip ?? []) {
          equipMap.set(eq.id, {
            key: eq.id,
            equipmentId: eq.id,
            tag: eq.tag,
            name: eq.name,
            photoCount: 0,
            photos: [],
          });
        }
        for (const item of day?.common.flatMap((g) => g.items) ?? []) {
          const key = `common:${item.id}`;
          equipMap.set(key, {
            key,
            tag: item.tag,
            name: item.device,
            photoCount: 0,
            photos: [],
          });
        }

        const notesKey = "_shift-notes";
        for (const photo of areaPhotos) {
          const key =
            photo.equipmentId || photo.equipmentTag || photo.commonId || photo.commonTag
              ? equipKey(photo)
              : notesKey;
          let row = equipMap.get(key);
          if (!row) {
            row = {
              key,
              equipmentId: photo.equipmentId,
              tag: photo.equipmentTag || photo.commonTag || (key === notesKey ? "SHIFT" : "PHOTO"),
              name:
                photo.equipmentName ||
                photo.commonName ||
                (key === notesKey ? "Shift notes and handover photos" : "Other photos"),
              photoCount: 0,
              photos: [],
            };
            equipMap.set(key, row);
          }
          row.photos.push(asFile(photo));
          row.photoCount += 1;
        }

        for (const row of equipMap.values()) {
          row.photos.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        }

        const equipment = [...equipMap.values()].sort((a, b) => {
          if (b.photoCount !== a.photoCount) return b.photoCount - a.photoCount;
          return a.name.localeCompare(b.name);
        });
        const photoCount = equipment.reduce((n, e) => n + e.photoCount, 0);
        areas.push({
          areaId,
          label: day?.label ?? areaId,
          photoCount,
          equipment,
        });
      }
      const photoCount = areas.reduce((n, a) => n + a.photoCount, 0);
      if (areas.length) {
        sections.push({
          sectionId: section.id,
          name: section.name,
          photoCount,
          areas,
        });
      }
    }
    const photoCount = sections.reduce((n, s) => n + s.photoCount, 0);
    if (sections.length) {
      plants.push({
        plantId: plant.id,
        name: plant.name,
        photoCount,
        sections,
      });
    }
  }

  return plants;
}

export function isAlbumPhoto(meta: PhotoMeta) {
  return Boolean(meta.relPath) && meta.kind !== "selfie";
}
