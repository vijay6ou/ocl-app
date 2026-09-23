/** Chittapur plant local time. */
export const PLANT_TIME_ZONE = "Asia/Kolkata";
export const PLANT_TIME_ZONE_LABEL = "IST";
export const HISTORY_DAYS = 30;

function ymdInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayPlantDate() {
  return ymdInZone(new Date(), PLANT_TIME_ZONE);
}

export function defaultHistoryRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - HISTORY_DAYS);
  return {
    from: ymdInZone(from, PLANT_TIME_ZONE),
    to: ymdInZone(to, PLANT_TIME_ZONE),
  };
}

/** Exact submit instant: date + time, plant local, else UTC with label. */
export function formatSubmitTimestamp(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: PLANT_TIME_ZONE,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `${fmt.format(date)} ${PLANT_TIME_ZONE_LABEL}`;
  } catch {
    return `${date.toISOString().replace("T", " ").replace("Z", "")} UTC`;
  }
}

export function submitInstant(record: { submittedAt?: string; savedAt?: string }) {
  return record.submittedAt || record.savedAt || "";
}

export function plantCalendarDate(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return ymdInZone(date, PLANT_TIME_ZONE);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Include a record if its round date or submit/save calendar date falls in [from, to]. */
export function recordInDateRange(
  record: { meta: { date: string }; submittedAt?: string; savedAt?: string },
  from?: string | null,
  to?: string | null
) {
  if (!from && !to) return true;
  const dates = [record.meta.date];
  const instant = plantCalendarDate(submitInstant(record));
  if (instant && !dates.includes(instant)) dates.push(instant);
  return dates.some((d) => (!from || d >= from) && (!to || d <= to));
}
