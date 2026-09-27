/** Frontend-only mock for plant → section → area UX samples. Not persisted. */

export type GrantKind = "plant" | "section" | "area";
export type UxRole = "admin" | "technician";

export type UxPlant = { id: string; name: string };
export type UxSection = { id: string; plantId: string; name: string };
export type UxArea = { id: string; sectionId: string; name: string; badge: string };
export type UxReading = { label: string; unit: string; limit: string };
export type UxBlock = {
  id: string;
  family: string;
  title: string;
  summary: string;
  parts: string[];
  readings: UxReading[];
  runningChecks: string[];
  stoppedChecks: string[];
};
export type UxPlaced = {
  id: string;
  areaId: string;
  blockId: string;
  tag: string;
  name: string;
};
export type UxPerson = {
  id: string;
  name: string;
  username: string;
  role: UxRole;
};
export type UxGrant = { userId: string; kind: GrantKind; targetId: string };

export type UxState = {
  plants: UxPlant[];
  sections: UxSection[];
  areas: UxArea[];
  blocks: UxBlock[];
  placed: UxPlaced[];
  people: UxPerson[];
  grants: UxGrant[];
  viewerId: string;
};

function block(
  id: string,
  family: string,
  title: string,
  summary: string,
  parts: string[],
  readings: UxReading[],
  runningChecks: string[],
  stoppedChecks: string[]
): UxBlock {
  return { id, family, title, summary, parts, readings, runningChecks, stoppedChecks };
}

const MH = "sec-mh";
const PLANT = "plt-chittapur";

export const UX_SEED: UxState = {
  plants: [{ id: PLANT, name: "Adani Cements Chittapur" }],
  sections: [{ id: MH, plantId: PLANT, name: "Material handling" }],
  areas: [
    { id: "area-additive", sectionId: MH, name: "Additive", badge: "ADD" },
    { id: "area-bauxite", sectionId: MH, name: "Bauxite", badge: "BAX" },
    { id: "area-gypsum", sectionId: MH, name: "Gypsum", badge: "GYP" },
    { id: "area-lc8", sectionId: MH, name: "LC-8 / Tippler", badge: "LC8" },
    { id: "area-coal-reclaim", sectionId: MH, name: "Coal reclaimers", badge: "RCL" },
    { id: "area-coal-crusher", sectionId: MH, name: "Coal crusher", badge: "CCR" },
  ],
  blocks: [
    block(
      "lt-cage-direct",
      "Low-tension motors",
      "Squirrel-cage motor, direct starter",
      "Stator, both bearings, terminal box, and DOL / star-delta starter.",
      ["Stator", "DE bearing", "NDE bearing", "Terminal box", "Cooling fan", "Starter"],
      [
        { label: "Stator current", unit: "A", limit: "≤ FLA" },
        { label: "Supply voltage", unit: "V", limit: "415 ± 6%" },
        { label: "DE bearing temperature", unit: "°C", limit: "< 85°C" },
        { label: "NDE bearing temperature", unit: "°C", limit: "< 85°C" },
      ],
      [
        "Stator frame — no crack, hot spot, or burnt smell",
        "Terminal box — cover and glands sound",
        "DE and NDE bearings — no growl",
        "Starter lamp matches the run state",
      ],
      ["Isolated before covers open", "Insulation megger recorded", "Overload matches nameplate FLA"]
    ),
    block(
      "lt-cage-vsd",
      "Low-tension motors",
      "Squirrel-cage motor with variable-speed drive",
      "Motor plus the drive cabinet, output cable, and speed feedback.",
      ["Stator", "DE bearing", "NDE bearing", "Drive cabinet", "Motor cable", "Speed feedback"],
      [
        { label: "Drive output frequency", unit: "Hz", limit: "As per process" },
        { label: "Drive output current", unit: "A", limit: "≤ motor FLA" },
        { label: "DC bus voltage", unit: "V", limit: "As per drive rating" },
      ],
      [
        "Drive display healthy, no fault code",
        "Output frequency matches the set point",
        "Cabinet filters clear, not hot",
        "Motor cable screen bonded at both ends",
      ],
      ["Drive isolated", "Motor insulation recorded", "Parameter backup noted"]
    ),
    block(
      "lt-wound-lrs",
      "Low-tension motors",
      "Wound-rotor motor with liquid starter",
      "Slip rings, brush gear, and the liquid resistance starter.",
      ["Stator", "Slip rings", "Brush gear", "Rotor cables", "Liquid starter", "Bearings"],
      [
        { label: "Stator current", unit: "A", limit: "≤ FLA" },
        { label: "Rotor current", unit: "A", limit: "As per nameplate" },
        { label: "Slip-ring temperature", unit: "°C", limit: "< 90°C" },
      ],
      [
        "Brush gear rides true, no sparking",
        "Slip rings even colour, no groove",
        "Liquid starter electrolyte at the mark",
      ],
      ["Rotor shorting contacts inspected", "Brush length recorded"]
    ),
    block(
      "ht-cage-direct",
      "High-tension motors",
      "High-tension squirrel-cage, direct start",
      "HT stator, bearings, surge pack, and the HT panel.",
      ["HT stator", "DE bearing", "NDE bearing", "Surge pack", "HT panel", "Space heater"],
      [
        { label: "Stator current", unit: "A", limit: "≤ FLA" },
        { label: "Supply voltage", unit: "kV", limit: "Nameplate ± 6%" },
        { label: "DE bearing temperature", unit: "°C", limit: "< 85°C" },
      ],
      ["HT panel closed and earths tight", "Space heater off while running", "No partial-discharge noise"],
      ["PTW and earths confirmed", "Insulation at HT voltage recorded"]
    ),
    block(
      "tx-oil",
      "Transformers",
      "Oil-filled transformer",
      "Conservator, Buchholz, silica gel, winding and oil temperature.",
      ["Conservator", "Buchholz", "Silica gel", "OTI / WTI", "Bushings", "Oil"],
      [
        { label: "Oil temperature", unit: "°C", limit: "< alarm" },
        { label: "Winding temperature", unit: "°C", limit: "< alarm" },
        { label: "Load current", unit: "A", limit: "≤ rating" },
      ],
      [
        "Silica gel blue, breather oil cup filled",
        "Buchholz petcock dry",
        "Bushings clean, no oil weep",
      ],
      ["Oil level at the conservator mark", "OTI / WTI pointers free"]
    ),
    block(
      "belt-conveyor",
      "Plant drives",
      "Belt conveyor",
      "Drive motor, brake, belt sway, and pull-cord.",
      ["Drive motor", "Brake", "Tail pulley", "Belt sway switches", "Pull-cord", "Zero-speed"],
      [
        { label: "Drive current", unit: "A", limit: "≤ FLA" },
        { label: "Belt speed", unit: "m/s", limit: "Nameplate" },
      ],
      ["Pull-cord resets, not bridged", "Sway switches free", "Brake lifts cleanly"],
      ["Isolated at the local isolator", "Belt splice condition noted"]
    ),
    block(
      "process-fan",
      "Plant drives",
      "Process fan",
      "Fan motor, both bearings, damper, and vibration.",
      ["Fan motor", "DE bearing", "NDE bearing", "Damper", "Coupling"],
      [
        { label: "Motor current", unit: "A", limit: "≤ FLA" },
        { label: "Fan bearing temperature", unit: "°C", limit: "< 85°C" },
      ],
      ["Damper position matches process", "No scrape from the impeller"],
      ["Damper locked off the impeller", "Coupling element inspected"]
    ),
  ],
  placed: [
    {
      id: "eq-add-1",
      areaId: "area-additive",
      blockId: "belt-conveyor",
      tag: "BC-ADD-01",
      name: "Additive belt",
    },
    {
      id: "eq-add-2",
      areaId: "area-additive",
      blockId: "lt-cage-vsd",
      tag: "M-ADD-02",
      name: "Weigh-feeder drive",
    },
    {
      id: "eq-gyp-1",
      areaId: "area-gypsum",
      blockId: "lt-cage-direct",
      tag: "M-GYP-01",
      name: "Gypsum feeder motor",
    },
  ],
  people: [
    { id: "u-admin", name: "Plant admin", username: "admin", role: "admin" },
    { id: "u-ramesh", name: "Ramesh", username: "ramesh", role: "technician" },
    { id: "u-suresh", name: "Suresh", username: "suresh", role: "technician" },
  ],
  grants: [
    { userId: "u-ramesh", kind: "section", targetId: MH },
    { userId: "u-suresh", kind: "area", targetId: "area-additive" },
    { userId: "u-suresh", kind: "area", targetId: "area-gypsum" },
  ],
  viewerId: "u-admin",
};

export function slugId(prefix: string, name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${slug || "item"}-${rand}`;
}

export function badgeFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NEW";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? "")).toUpperCase();
}

export function viewer(state: UxState) {
  return state.people.find((p) => p.id === state.viewerId) ?? state.people[0];
}

export function isAdmin(state: UxState) {
  return viewer(state).role === "admin";
}

function sectionOf(state: UxState, sectionId: string) {
  return state.sections.find((s) => s.id === sectionId);
}

function plantOfArea(state: UxState, area: UxArea) {
  const section = sectionOf(state, area.sectionId);
  if (!section) return null;
  return state.plants.find((p) => p.id === section.plantId) ?? null;
}

export function hasGrant(state: UxState, userId: string, kind: GrantKind, targetId: string) {
  return state.grants.some((g) => g.userId === userId && g.kind === kind && g.targetId === targetId);
}

export function canSeePlant(state: UxState, plantId: string, userId = state.viewerId) {
  const person = state.people.find((p) => p.id === userId);
  if (!person || person.role === "admin") return true;
  if (hasGrant(state, userId, "plant", plantId)) return true;
  const sectionIds = state.sections.filter((s) => s.plantId === plantId).map((s) => s.id);
  if (sectionIds.some((id) => hasGrant(state, userId, "section", id))) return true;
  return state.areas.some(
    (a) => sectionIds.includes(a.sectionId) && hasGrant(state, userId, "area", a.id)
  );
}

export function canSeeSection(state: UxState, sectionId: string, userId = state.viewerId) {
  const person = state.people.find((p) => p.id === userId);
  if (!person || person.role === "admin") return true;
  const section = sectionOf(state, sectionId);
  if (!section) return false;
  if (hasGrant(state, userId, "plant", section.plantId)) return true;
  if (hasGrant(state, userId, "section", sectionId)) return true;
  return state.areas.some((a) => a.sectionId === sectionId && hasGrant(state, userId, "area", a.id));
}

export function canSeeArea(state: UxState, areaId: string, userId = state.viewerId) {
  const person = state.people.find((p) => p.id === userId);
  if (!person || person.role === "admin") return true;
  const area = state.areas.find((a) => a.id === areaId);
  if (!area) return false;
  const section = sectionOf(state, area.sectionId);
  if (!section) return false;
  if (hasGrant(state, userId, "plant", section.plantId)) return true;
  if (hasGrant(state, userId, "section", area.sectionId)) return true;
  return hasGrant(state, userId, "area", areaId);
}

export function coverageOfArea(
  state: UxState,
  userId: string,
  areaId: string
): "none" | "plant" | "section" | "area" {
  const area = state.areas.find((a) => a.id === areaId);
  if (!area) return "none";
  const section = sectionOf(state, area.sectionId);
  if (!section) return "none";
  if (hasGrant(state, userId, "plant", section.plantId)) return "plant";
  if (hasGrant(state, userId, "section", area.sectionId)) return "section";
  if (hasGrant(state, userId, "area", areaId)) return "area";
  return "none";
}

export function visiblePlants(state: UxState) {
  return state.plants.filter((p) => canSeePlant(state, p.id));
}

export function visibleSections(state: UxState, plantId: string) {
  return state.sections.filter((s) => s.plantId === plantId && canSeeSection(state, s.id));
}

export function visibleAreas(state: UxState, sectionId: string) {
  return state.areas.filter((a) => a.sectionId === sectionId && canSeeArea(state, a.id));
}

export function assignedAreas(state: UxState, userId = state.viewerId) {
  return state.areas.filter((a) => canSeeArea(state, a.id, userId));
}

export function pathForArea(state: UxState, areaId: string) {
  const area = state.areas.find((a) => a.id === areaId);
  if (!area) return { plant: "", section: "", area: "" };
  const section = sectionOf(state, area.sectionId);
  const plant = section ? state.plants.find((p) => p.id === section.plantId) : undefined;
  return {
    plant: plant?.name ?? "",
    section: section?.name ?? "",
    area: area.name,
  };
}

export function blockById(state: UxState, blockId: string) {
  return state.blocks.find((b) => b.id === blockId);
}

export function placedInArea(state: UxState, areaId: string) {
  return state.placed.filter((p) => p.areaId === areaId);
}

export function usesOfBlock(state: UxState, blockId: string) {
  return state.placed.filter((p) => p.blockId === blockId);
}

export function grantLabel(state: UxState, grant: UxGrant) {
  if (grant.kind === "plant") {
    return state.plants.find((p) => p.id === grant.targetId)?.name ?? grant.targetId;
  }
  if (grant.kind === "section") {
    const section = state.sections.find((s) => s.id === grant.targetId);
    const plant = section ? state.plants.find((p) => p.id === section.plantId) : undefined;
    return [plant?.name, section?.name].filter(Boolean).join(" · ");
  }
  const area = state.areas.find((a) => a.id === grant.targetId);
  if (!area) return grant.targetId;
  const trail = pathForArea(state, area.id);
  return `${trail.plant} · ${trail.section} · ${trail.area}`;
}

export function plantOfAreaId(state: UxState, areaId: string) {
  const area = state.areas.find((a) => a.id === areaId);
  return area ? plantOfArea(state, area) : null;
}

export const BLOCK_FAMILIES = [
  "Low-tension motors",
  "High-tension motors",
  "Transformers",
  "Plant drives",
  "Other",
] as const;
