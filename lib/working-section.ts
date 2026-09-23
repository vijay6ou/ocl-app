import { DAY_BLURBS } from "@/lib/constants";
import type { DayKey, SubmissionMeta } from "@/lib/types";

export function workingSectionLabel(meta: Pick<SubmissionMeta, "form" | "dayLabel" | "day">) {
  const form = meta.form?.trim();
  if (form) return form;
  const label = meta.dayLabel?.trim();
  if (label) return label;
  return weekdaySection(meta.day);
}

export function weekdaySection(day: DayKey) {
  const blurb = DAY_BLURBS[day];
  return `${blurb.weekday} – ${blurb.section}`;
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
