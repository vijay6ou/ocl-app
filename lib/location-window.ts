import { PLANT_TIME_ZONE } from "@/lib/submit-time";

export type LocationWindow = {
  enabled: boolean;
  /** Plant-local start, 24-hour HH:mm. */
  start: string;
  /** Plant-local end, 24-hour HH:mm. End is exclusive. */
  end: string;
};

export const DEFAULT_LOCATION_WINDOW: LocationWindow = {
  enabled: true,
  start: "08:00",
  end: "20:00",
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseClock(value: string) {
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeLocationWindow(input: Partial<LocationWindow> | null | undefined): LocationWindow {
  const start = typeof input?.start === "string" && parseClock(input.start) != null ? input.start : DEFAULT_LOCATION_WINDOW.start;
  const end = typeof input?.end === "string" && parseClock(input.end) != null ? input.end : DEFAULT_LOCATION_WINDOW.end;
  return {
    enabled: input?.enabled !== false,
    start,
    end,
  };
}

export function plantMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PLANT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

/** True when plant-local time is inside the duty window. A window that passes midnight is allowed. */
export function isInsideLocationWindow(window: LocationWindow, date = new Date()) {
  if (!window.enabled) return false;
  const start = parseClock(window.start);
  const end = parseClock(window.end);
  if (start == null || end == null || start === end) return false;
  const now = plantMinutes(date);
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function formatLocationWindow(window: LocationWindow) {
  if (!window.enabled) return "Location recording is off";
  return `${window.start}–${window.end} IST`;
}
