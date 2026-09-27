import type {
  AccessGrant,
  Catalogue,
  DayCatalogue,
  GrantKind,
  Plant,
  PlantSection,
  PublicUser,
  UserRecord,
} from "@/lib/types";

export { isSafeSectionId, newPlantId, MATERIAL_HANDLING_ID } from "@/lib/section-ids";

export const CHITTAPUR_PLANT_ID = "chittapur";

export const WEEKDAY_TO_AREA: Record<string, string> = {
  mon: "additive",
  tue: "bauxite",
  wed: "gypsum",
  thu: "lc8",
  fri: "coal-reclaim",
  sat: "coal-crusher",
};

export const AREA_TO_WEEKDAY: Record<string, string> = Object.fromEntries(
  Object.entries(WEEKDAY_TO_AREA).map(([day, area]) => [area, day])
);

export const MATERIAL_AREAS: {
  id: string;
  from: string;
  label: string;
  badge: string;
  formLabel: string;
  blurb: string;
}[] = [
  {
    id: "additive",
    from: "mon",
    label: "Additive",
    badge: "ADD",
    formLabel: "Material handling – Additive",
    blurb: "Truck tippler, weigh feeder, 113BC080/100, HT crusher, stacker.",
  },
  {
    id: "bauxite",
    from: "tue",
    label: "Bauxite",
    badge: "BAX",
    formLabel: "Material handling – Bauxite",
    blurb: "Bauxite feeders, crushers, and yard belts.",
  },
  {
    id: "gypsum",
    from: "wed",
    label: "Gypsum",
    badge: "GYP",
    formLabel: "Material handling – Gypsum",
    blurb: "Gypsum hoppers, feeders, crushers, and belt drives.",
  },
  {
    id: "lc8",
    from: "thu",
    label: "LC-8 / Tippler",
    badge: "LC8",
    formLabel: "Material handling – LC-8 / Tippler",
    blurb: "Wagon tippler, LC-8 feed path, and associated conveyors.",
  },
  {
    id: "coal-reclaim",
    from: "fri",
    label: "Coal reclaimers",
    badge: "RCL",
    formLabel: "Material handling – Coal reclaimers",
    blurb: "Coal reclaimers, yard belts, and feed conveyors.",
  },
  {
    id: "coal-crusher",
    from: "sat",
    label: "Coal crusher",
    badge: "CCR",
    formLabel: "Material handling – Coal crusher",
    blurb: "HT coal crusher, LRS, stacker, and reclaim path.",
  },
];

const DROPPED_AREA_PREFIX = /^(rm|kn|cm|pp)-/;
const DROPPED_FLAT_AREAS = new Set(["raw-mill", "kiln", "cement-mill", "power-plant"]);

export function isDroppedLegacyId(id: string) {
  return DROPPED_FLAT_AREAS.has(id) || DROPPED_AREA_PREFIX.test(id);
}

export function canonicalAreaId(id: string) {
  return WEEKDAY_TO_AREA[id] ?? id;
}

export function areaIdsMatch(a: string, b: string) {
  return canonicalAreaId(a) === canonicalAreaId(b);
}

export function emptyArea(spec: {
  label: string;
  formLabel: string;
  badge?: string;
  blurb?: string;
}): DayCatalogue {
  return {
    label: spec.label,
    formLabel: spec.formLabel,
    badge: spec.badge ?? "",
    blurb: spec.blurb ?? "",
    equip: [],
    common: [],
  };
}

export function findSectionForArea(catalogue: Catalogue, areaId: string): PlantSection | null {
  const id = canonicalAreaId(areaId);
  return catalogue.sections.find((s) => s.areaIds.includes(id) || s.areaIds.includes(areaId)) ?? null;
}

export function findPlant(catalogue: Catalogue, plantId: string): Plant | null {
  return catalogue.plants.find((p) => p.id === plantId) ?? null;
}

export function findPlantForArea(catalogue: Catalogue, areaId: string): Plant | null {
  const section = findSectionForArea(catalogue, areaId);
  if (!section) return null;
  return findPlant(catalogue, section.plantId);
}

export function pathForArea(catalogue: Catalogue, areaId: string) {
  const id = canonicalAreaId(areaId);
  const area = catalogue.days[id] ?? catalogue.days[areaId];
  const section = findSectionForArea(catalogue, areaId);
  const plant = section ? findPlant(catalogue, section.plantId) : null;
  return {
    plant,
    section,
    area,
    areaId: id,
  };
}

export function sectionsOfPlant(catalogue: Catalogue, plantId: string) {
  return catalogue.sections.filter((s) => s.plantId === plantId);
}

export function grantsOf(user: Pick<UserRecord, "role" | "grants"> | PublicUser): AccessGrant[] {
  if (user.role === "admin") return [];
  return user.grants ?? [];
}

export function hasExactGrant(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  kind: GrantKind,
  targetId: string
) {
  if (user.role === "admin") return true;
  return (user.grants ?? []).some((g) => g.kind === kind && g.targetId === targetId);
}

export function canSeePlant(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  catalogue: Catalogue,
  plantId: string
) {
  if (user.role === "admin") return true;
  if (hasExactGrant(user, "plant", plantId)) return true;
  const sections = sectionsOfPlant(catalogue, plantId);
  if (sections.some((s) => hasExactGrant(user, "section", s.id))) return true;
  return sections.some((s) => s.areaIds.some((id) => hasExactGrant(user, "area", id)));
}

export function canSeeSection(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  catalogue: Catalogue,
  sectionId: string
) {
  if (user.role === "admin") return true;
  const section = catalogue.sections.find((s) => s.id === sectionId);
  if (!section) return false;
  if (hasExactGrant(user, "plant", section.plantId)) return true;
  if (hasExactGrant(user, "section", sectionId)) return true;
  return section.areaIds.some((id) => hasExactGrant(user, "area", id));
}

export function canSeeArea(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  catalogue: Catalogue,
  areaId: string
) {
  if (user.role === "admin") return true;
  const id = canonicalAreaId(areaId);
  const section = findSectionForArea(catalogue, id);
  if (!section) return false;
  if (hasExactGrant(user, "plant", section.plantId)) return true;
  if (hasExactGrant(user, "section", section.id)) return true;
  return hasExactGrant(user, "area", id);
}

export function coverageOfArea(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  catalogue: Catalogue,
  areaId: string
): "none" | "plant" | "section" | "area" {
  if (user.role === "admin") return "plant";
  const id = canonicalAreaId(areaId);
  const section = findSectionForArea(catalogue, id);
  if (!section) return "none";
  if (hasExactGrant(user, "plant", section.plantId)) return "plant";
  if (hasExactGrant(user, "section", section.id)) return "section";
  if (hasExactGrant(user, "area", id)) return "area";
  return "none";
}

export function visiblePlants(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  catalogue: Catalogue
) {
  return catalogue.plants.filter((p) => canSeePlant(user, catalogue, p.id));
}

export function filterCatalogueForUser(
  user: Pick<UserRecord, "role" | "grants"> | PublicUser,
  catalogue: Catalogue
): Catalogue {
  if (user.role === "admin") return catalogue;
  const plants = visiblePlants(user, catalogue);
  const sections = catalogue.sections.filter((s) => canSeeSection(user, catalogue, s.id));
  const areaIds = new Set(sections.flatMap((s) => s.areaIds.filter((id) => canSeeArea(user, catalogue, id))));
  const days: Catalogue["days"] = {};
  for (const id of areaIds) {
    if (catalogue.days[id]) days[id] = catalogue.days[id];
  }
  return {
    ...catalogue,
    plants,
    sections: sections.map((s) => ({ ...s, areaIds: s.areaIds.filter((id) => areaIds.has(id)) })),
    days,
  };
}

export function toggleGrant(list: AccessGrant[], grant: AccessGrant): AccessGrant[] {
  const exists = list.some((g) => g.kind === grant.kind && g.targetId === grant.targetId);
  if (exists) return list.filter((g) => !(g.kind === grant.kind && g.targetId === grant.targetId));
  return [...list, grant];
}

export function badgeFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NEW";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? "")).toUpperCase();
}
