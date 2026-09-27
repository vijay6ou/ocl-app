import { DAY_KEYS, type DayKey } from "@/lib/types";
import { isSafeSectionId } from "@/lib/section-ids";
import type { Catalogue, DayCatalogue, DaysData } from "@/lib/types";

function slugId(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || fallback;
}

export function validateSection(key: string, day: DayCatalogue) {
  if (!day) throw new Error(`Missing plant area ${key}.`);
  if (!isSafeSectionId(key)) throw new Error(`Area id ${key} is not valid.`);
  if (!day.label?.trim() || !day.formLabel?.trim()) {
    throw new Error(`Area ${key} needs a label.`);
  }
  day.badge = day.badge?.trim() ?? "";
  day.blurb = day.blurb?.trim() ?? "";
  if (!Array.isArray(day.equip) || !Array.isArray(day.common)) {
    throw new Error(`Area ${key} is missing equipment or common devices.`);
  }
  const equipIds = new Set<string>();
  const tags = new Set<string>();
  for (const e of day.equip) {
    if (!e.id?.trim() || !e.tag?.trim() || !e.name?.trim()) {
      throw new Error("Every equipment row needs an id, tag, and name.");
    }
    if (equipIds.has(e.id)) throw new Error(`Duplicate equipment id ${e.id}.`);
    if (tags.has(e.tag)) throw new Error(`Duplicate tag ${e.tag} on ${key}.`);
    equipIds.add(e.id);
    tags.add(e.tag);
    const paramIds = new Set<string>();
    for (const p of e.runningParams ?? []) {
      if (!p.id?.trim() || !p.label?.trim()) {
        throw new Error(`Parameter on ${e.tag} needs an id and label.`);
      }
      if (paramIds.has(p.id)) {
        throw new Error(`Duplicate parameter ${p.id} on ${e.tag}.`);
      }
      paramIds.add(p.id);
      p.unit = p.unit ?? "";
      p.limit = p.limit ?? "";
      p.phases = Boolean(p.phases);
    }
    e.runningChecks = (e.runningChecks ?? []).map((s) => String(s).trim()).filter(Boolean);
    e.stoppedChecks = (e.stoppedChecks ?? []).map((s) => String(s).trim()).filter(Boolean);
    e.runningParams = e.runningParams ?? [];
    e.isHT = Boolean(e.isHT);
    if (e.blockId != null) {
      const blockId = String(e.blockId).trim();
      if (blockId) e.blockId = blockId;
      else delete e.blockId;
    }
  }
  const commonIds = new Set<string>();
  for (const g of day.common) {
    if (!g.id?.trim() || !g.name?.trim()) {
      throw new Error("Each common-device group needs an id and name.");
    }
    g.items = g.items ?? [];
    for (const item of g.items) {
      if (!item.id?.trim() || !item.tag?.trim() || !item.device?.trim()) {
        throw new Error(`Common device in ${g.name} needs id, tag, and name.`);
      }
      if (commonIds.has(item.id)) {
        throw new Error(`Duplicate common device id ${item.id}.`);
      }
      commonIds.add(item.id);
      item.check = item.check ?? "";
    }
  }
  return day;
}

export function validateDays(days: DaysData) {
  for (const key of Object.keys(days)) validateSection(key, days[key]);
  return days;
}

export function validatePlantCatalogue(catalogue: Pick<Catalogue, "plants" | "sections" | "days">) {
  if (!Array.isArray(catalogue.plants) || catalogue.plants.length === 0) {
    throw new Error("Add at least one plant.");
  }
  const days = validateDays(catalogue.days);
  const plantIds = new Set<string>();
  for (const plant of catalogue.plants) {
    if (!isSafeSectionId(plant.id)) throw new Error("Each plant needs a valid id.");
    if (!plant.name?.trim()) throw new Error("Each plant needs a name.");
    if (plantIds.has(plant.id)) throw new Error(`Duplicate plant ${plant.id}.`);
    plantIds.add(plant.id);
    plant.name = plant.name.trim();
  }
  const sectionIds = new Set<string>();
  const listedAreas = new Set<string>();
  for (const section of catalogue.sections) {
    if (!isSafeSectionId(section.id)) throw new Error("Each section needs a valid id.");
    if (!section.name?.trim()) throw new Error("Each section needs a name.");
    if (!plantIds.has(section.plantId)) {
      throw new Error(`${section.name} is not attached to a plant.`);
    }
    if (sectionIds.has(section.id)) throw new Error(`Duplicate section ${section.id}.`);
    sectionIds.add(section.id);
    section.name = section.name.trim();
    section.blurb = section.blurb?.trim() ?? "";
    section.areaIds = section.areaIds ?? [];
    for (const id of section.areaIds) {
      if (!days[id]) throw new Error(`${section.name} lists a missing area ${id}.`);
      if (listedAreas.has(id)) throw new Error(`Area ${id} is in more than one section.`);
      listedAreas.add(id);
    }
  }
  for (const id of Object.keys(days)) {
    if (!listedAreas.has(id)) {
      throw new Error(`Area ${id} is not placed in a section.`);
    }
  }
  return { plants: catalogue.plants, sections: catalogue.sections, days };
}

export function uniqueId(seed: string, used: Set<string>, fallback: string) {
  const base = slugId(seed, fallback);
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

export function newEquipmentId(tag: string, used: Set<string>) {
  return uniqueId(tag, used, "eq");
}

export function newParamId(label: string, used: Set<string>) {
  return uniqueId(label, used, "p");
}

export function newGroupId(name: string, used: Set<string>) {
  return uniqueId(name, used, "grp");
}

export function newCommonItemId(tag: string, used: Set<string>) {
  return uniqueId(tag, used, "cm");
}

export function isDayKey(value: string): value is DayKey {
  return (DAY_KEYS as readonly string[]).includes(value);
}
