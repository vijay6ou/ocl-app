import type { DayKey } from "./types";
export { DAY_KEYS } from "./types";

export const APP_NAME = "Adani Cements Weekly Electrical Maintenance";
export const PLANT_NAME = "Adani Cements";
export const DEPT_NAME = "Electrical Department · Chittapur";
export const SESSION_COOKIE = "ocl_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export const DAY_BLURBS: Record<
  DayKey,
  { weekday: string; section: string; blurb: string }
> = {
  mon: {
    weekday: "Monday",
    section: "Additive Section",
    blurb: "Truck tippler, weigh feeder, 113BC080/100, HT crusher, stacker.",
  },
  tue: {
    weekday: "Tuesday",
    section: "Bauxite Section",
    blurb: "Bauxite feeders, crushers, and yard belts for the weekly PM round.",
  },
  wed: {
    weekday: "Wednesday",
    section: "Gypsum Section",
    blurb: "Gypsum hoppers, feeders, crushers, and belt drives.",
  },
  thu: {
    weekday: "Thursday",
    section: "LC-8 / Tippler",
    blurb: "Wagon tippler, LC-8 feed path, and associated conveyors.",
  },
  fri: {
    weekday: "Friday",
    section: "Coal Reclaimers",
    blurb: "Coal reclaimers, yard belts, and feed conveyors.",
  },
  sat: {
    weekday: "Saturday",
    section: "Coal Crusher & Stacker",
    blurb: "HT coal crusher, LRS, stacker, and reclaim path.",
  },
};

export const SEED_ACCOUNTS = [
  {
    username: "admin",
    name: "Electrical Admin",
    role: "admin" as const,
    password: "Chittapur-Admin-26",
  },
  {
    username: "ramesh.k",
    name: "Ramesh Kumar",
    role: "technician" as const,
    password: "ShiftA-Ramesh-26",
  },
  {
    username: "priya.m",
    name: "Priya Menon",
    role: "technician" as const,
    password: "ShiftB-Priya-26",
  },
  {
    username: "suresh.n",
    name: "Suresh Naik",
    role: "technician" as const,
    password: "ShiftC-Suresh-26",
  },
  {
    username: "anjali.p",
    name: "Anjali Patil",
    role: "technician" as const,
    password: "General-Anjali-26",
  },
];
