import seedDays from "@/lib/seed/all-days-data.json";
import {
  CHITTAPUR_PLANT_ID,
  MATERIAL_AREAS,
  MATERIAL_HANDLING_ID,
  canonicalAreaId,
  isDroppedLegacyId,
} from "@/lib/hierarchy";
import type { Catalogue, DaysData, Plant, PlantArea, PlantSection } from "@/lib/types";

export {
  MATERIAL_HANDLING_ID,
  findPlant,
  findPlantForArea,
  findSectionForArea,
  isSafeSectionId,
  newPlantId,
  pathForArea,
} from "@/lib/hierarchy";

type RawCatalogue = {
  version?: string;
  updatedAt?: string;
  plants?: Plant[];
  sections?: PlantSection[];
  areas?: PlantArea[];
  days?: DaysData;
};

function renameWeekdayAreas(days: DaysData): { days: DaysData; migrated: boolean } {
  const next: DaysData = { ...days };
  let migrated = false;
  for (const spec of MATERIAL_AREAS) {
    const from = next[spec.from];
    const existing = next[spec.id];
    if (from && !existing) {
      next[spec.id] = {
        ...from,
        label: spec.label,
        formLabel: spec.formLabel,
        badge: spec.badge,
        blurb: from.blurb || spec.blurb,
      };
      delete next[spec.from];
      migrated = true;
    } else if (existing) {
      if (existing.label !== spec.label || existing.formLabel !== spec.formLabel) {
        next[spec.id] = {
          ...existing,
          label: spec.label,
          formLabel: spec.formLabel,
          badge: existing.badge || spec.badge,
        };
        migrated = true;
      }
      if (from && spec.from !== spec.id) {
        delete next[spec.from];
        migrated = true;
      }
    } else if (!existing) {
      next[spec.id] = {
        label: spec.label,
        formLabel: spec.formLabel,
        badge: spec.badge,
        blurb: spec.blurb,
        equip: [],
        common: [],
      };
      migrated = true;
    }
  }
  for (const id of Object.keys(next)) {
    if (isDroppedLegacyId(id)) {
      delete next[id];
      migrated = true;
    }
  }
  return { days: next, migrated };
}

function seedHierarchy(days: DaysData): { plants: Plant[]; sections: PlantSection[] } {
  return {
    plants: [{ id: CHITTAPUR_PLANT_ID, name: "Adani Cements Chittapur" }],
    sections: [
      {
        id: MATERIAL_HANDLING_ID,
        plantId: CHITTAPUR_PLANT_ID,
        name: "Material handling",
        blurb: "Additive, bauxite, gypsum, tippler, and coal yard.",
        areaIds: MATERIAL_AREAS.map((a) => a.id),
      },
    ],
  };
}

export function normalizeCatalogue(raw: RawCatalogue | null | undefined): {
  catalogue: Catalogue;
  migrated: boolean;
} {
  const now = new Date().toISOString();
  const seed = seedDays as DaysData;
  const renamed = renameWeekdayAreas({ ...(raw?.days ?? seed) });
  let migrated = renamed.migrated;
  const days = renamed.days;

  let plants = Array.isArray(raw?.plants) ? raw!.plants.map((p) => ({ ...p })) : [];
  let sections = Array.isArray(raw?.sections)
    ? raw!.sections.map((s) => ({ ...s, areaIds: [...(s.areaIds ?? [])] }))
    : [];

  if (plants.length === 0) {
    const seeded = seedHierarchy(days);
    plants = seeded.plants;
    if (sections.length === 0) {
      const mh = raw?.areas?.find((a) => a.id === MATERIAL_HANDLING_ID);
      sections = [
        {
          id: MATERIAL_HANDLING_ID,
          plantId: CHITTAPUR_PLANT_ID,
          name: mh?.name?.replace("Handling", "handling") || "Material handling",
          blurb: "Additive, bauxite, gypsum, tippler, and coal yard.",
          areaIds: MATERIAL_AREAS.map((a) => a.id).filter((id) => Boolean(days[id])),
        },
      ];
    }
    migrated = true;
  }

  plants = plants.map((p) => ({ id: p.id, name: p.name }));

  sections = sections
    .filter((s) => !isDroppedLegacyId(s.id) && plants.some((p) => p.id === s.plantId))
    .map((s) => ({
      ...s,
      areaIds: (s.areaIds.length
        ? s.areaIds
        : s.id === MATERIAL_HANDLING_ID
          ? MATERIAL_AREAS.map((a) => a.id)
          : []
      )
        .map((id) => canonicalAreaId(id))
        .filter((id) => Boolean(days[id])),
    }));

  if (!sections.some((s) => s.id === MATERIAL_HANDLING_ID) && plants.some((p) => p.id === CHITTAPUR_PLANT_ID)) {
    sections.unshift({
      id: MATERIAL_HANDLING_ID,
      plantId: CHITTAPUR_PLANT_ID,
      name: "Material handling",
      blurb: "Additive, bauxite, gypsum, tippler, and coal yard.",
      areaIds: MATERIAL_AREAS.map((a) => a.id).filter((id) => Boolean(days[id])),
    });
    migrated = true;
  }

  const listed = new Set(sections.flatMap((s) => s.areaIds));
  for (const id of Object.keys(days)) {
    if (!listed.has(id) && !isDroppedLegacyId(id)) {
      const mh = sections.find((s) => s.id === MATERIAL_HANDLING_ID);
      if (mh && MATERIAL_AREAS.some((a) => a.id === id)) {
        mh.areaIds.push(id);
        migrated = true;
      }
    }
  }

  return {
    migrated,
    catalogue: {
      version: raw?.version || now,
      updatedAt: migrated ? now : raw?.updatedAt || now,
      plants,
      sections,
      days,
    },
  };
}