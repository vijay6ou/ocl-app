import type { DayCatalogue } from "@/lib/types";
import type { PhotoPlace } from "@/lib/media-path";

export type FileNoteKind = "note" | "log" | "paste";

export type FileNote = {
  id: string;
  title: string;
  body: string;
  filename: string;
  mime: string;
  size: number;
  kind: FileNoteKind;
  uploadedBy: string;
  uploadedAt: string;
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
  relPath: string;
  source?: PhotoPlace["source"];
};

export type CatalogueDraft = {
  areaId: string;
  section: DayCatalogue;
  savedAt: string;
  savedBy: string;
};
