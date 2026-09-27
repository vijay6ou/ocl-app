import { DAY_BLURBS, DAY_KEYS } from "@/lib/constants";
import type { DayKey, SubmissionMeta } from "@/lib/types";

export function workingSectionLabel(
  meta: Pick<SubmissionMeta, "form" | "dayLabel" | "day" | "areaName">
) {
  const form = meta.form?.trim();
  if (form) return form;
  const label = meta.dayLabel?.trim();
  if (label && meta.areaName?.trim()) return `${meta.areaName.trim()} – ${label}`;
  if (label) return label;
  return weekdaySection(meta.day);
}

export function weekdaySection(day: string) {
  if ((DAY_KEYS as readonly string[]).includes(day)) {
    const blurb = DAY_BLURBS[day as DayKey];
    return `${blurb.weekday} – ${blurb.section}`;
  }
  return day;
}

export function pdfSafe(text: string) {
  return String(text ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/°/g, " deg")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/±/g, "+/-")
    .replace(/µ/g, "u")
    .replace(/[^\t\n\r\x20-\x7E]/g, "?");
}
