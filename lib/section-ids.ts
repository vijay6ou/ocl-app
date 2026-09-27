import type { Catalogue } from "@/lib/types";

export const MATERIAL_HANDLING_ID = "material-handling";

export function isSafeSectionId(value: string) {
  return /^[a-z0-9][a-z0-9_-]{0,48}$/.test(value);
}

export function findArea(catalogue: Catalogue, sectionId: string) {
  return catalogue.areas.find((area) => area.sectionIds.includes(sectionId)) ?? null;
}

export function newPlantId(name: string, used: Set<string>, fallback: string) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || fallback;
  let id = base;
  let n = 2;
  while (used.has(id) || !isSafeSectionId(id)) {
    id = `${base}-${n}`.slice(0, 49);
    n += 1;
    if (n > 50) {
      id = `${fallback}-${n}`;
      break;
    }
  }
  return id;
}
