import { DAY_KEYS, type DaysData, type DayKey } from "@/lib/types";

function slugId(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || fallback;
}

export function validateDays(days: DaysData) {
  for (const key of DAY_KEYS) {
    const day = days[key];
    if (!day) throw new Error(`Missing plant section for ${key}.`);
    if (!day.label?.trim() || !day.formLabel?.trim()) {
      throw new Error(`Section ${key} needs a label.`);
    }
    if (!Array.isArray(day.equip) || !Array.isArray(day.common)) {
      throw new Error(`Section ${key} is missing equipment or common devices.`);
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
  }
  return days;
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
