export const NOTIFY_DEST_KEYS = ["discordReports", "discordLocation", "telegram"] as const;
export type NotifyDestKey = (typeof NOTIFY_DEST_KEYS)[number];

export const NOTIFY_EVENT_KEYS = ["roundSubmit", "dayNotes", "locationCheckIn"] as const;
export type NotifyEventKey = (typeof NOTIFY_EVENT_KEYS)[number];

export type NotifyDestinations = {
  discordReports: boolean;
  discordLocation: boolean;
  telegram: boolean;
};

export type NotifyEventRoute = {
  destinations: NotifyDestinations;
  onlyIfFaults: boolean;
};

export type NotifySettings = {
  version: 2;
  events: {
    roundSubmit: NotifyEventRoute;
    dayNotes: NotifyEventRoute;
    locationCheckIn: NotifyEventRoute;
  };
  payload: {
    fullForm: boolean;
    faultsOnly: boolean;
    photos: boolean;
    pdf: boolean;
    satelliteImage: boolean;
    coords: boolean;
    name: boolean;
    time: boolean;
  };
  when: {
    submitImmediate: boolean;
    locationOnSlot: boolean;
  };
};

export const NOTIFY_DEST_LABELS: Record<NotifyDestKey, string> = {
  discordReports: "Discord reports",
  discordLocation: "Discord location",
  telegram: "Telegram",
};

export const NOTIFY_EVENT_META: Record<
  NotifyEventKey,
  { label: string; hint: string }
> = {
  roundSubmit: {
    label: "Round submit",
    hint: "Discord gets the full form, faults, photos, and PDF. Telegram gets one comments summary plus the plant PDF — not a second copy of the full round.",
  },
  dayNotes: {
    label: "Day notes",
    hint: "Written day notes in that submit. Telegram already includes them in the round summary when round submit is ticked.",
  },
  locationCheckIn: {
    label: "Location check-in",
    hint: "15-minute slot while on duty. Defaults to the location channel.",
  },
};

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  version: 2,
  events: {
    roundSubmit: {
      destinations: { discordReports: true, discordLocation: false, telegram: true },
      onlyIfFaults: false,
    },
    dayNotes: {
      destinations: { discordReports: false, discordLocation: false, telegram: true },
      onlyIfFaults: false,
    },
    locationCheckIn: {
      destinations: { discordReports: false, discordLocation: true, telegram: false },
      onlyIfFaults: false,
    },
  },
  payload: {
    fullForm: true,
    faultsOnly: true,
    photos: true,
    pdf: true,
    satelliteImage: true,
    coords: true,
    name: true,
    time: true,
  },
  when: {
    submitImmediate: true,
    locationOnSlot: true,
  },
};

function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return fallback;
}

function destFlags(raw: unknown, fallback: NotifyDestinations): NotifyDestinations {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    discordReports: flag(src.discordReports, fallback.discordReports),
    discordLocation: flag(src.discordLocation, fallback.discordLocation),
    telegram: flag(src.telegram, fallback.telegram),
  };
}

function eventRoute(raw: unknown, fallback: NotifyEventRoute): NotifyEventRoute {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    destinations: destFlags(src.destinations, fallback.destinations),
    onlyIfFaults: flag(src.onlyIfFaults, fallback.onlyIfFaults),
  };
}

function isV2(raw: Record<string, unknown>): boolean {
  if (raw.version === 2) return true;
  const events = raw.events;
  if (!events || typeof events !== "object") return false;
  const submit = (events as Record<string, unknown>).roundSubmit;
  return Boolean(submit && typeof submit === "object" && !Array.isArray(submit));
}

function migrateV1(src: Record<string, unknown>): NotifySettings {
  const dest = (src.destinations ?? {}) as Record<string, unknown>;
  const events = (src.events ?? {}) as Record<string, unknown>;
  const when = (src.when ?? {}) as Record<string, unknown>;
  const d = DEFAULT_NOTIFY_SETTINGS;
  const discordReports = flag(dest.discordReports, true);
  const discordLocation = flag(dest.discordLocation, true);
  const telegram = flag(dest.telegram, true);
  const roundSubmit = flag(events.roundSubmit, true);
  const dayNotes = flag(events.dayNotes, true);
  const locationCheckIn = flag(events.locationCheckIn, true);
  const onlyIfFaults = flag(when.onlyIfFaults, false);
  return {
    version: 2,
    events: {
      roundSubmit: {
        destinations: {
          discordReports: discordReports && roundSubmit,
          discordLocation: false,
          telegram: telegram && roundSubmit,
        },
        onlyIfFaults,
      },
      dayNotes: {
        destinations: {
          discordReports: false,
          discordLocation: false,
          telegram: telegram && dayNotes,
        },
        onlyIfFaults: false,
      },
      locationCheckIn: {
        destinations: {
          discordReports: false,
          discordLocation: discordLocation && locationCheckIn,
          telegram: false,
        },
        onlyIfFaults: false,
      },
    },
    payload: d.payload,
    when: {
      submitImmediate: flag(when.submitImmediate, d.when.submitImmediate),
      locationOnSlot: flag(when.locationOnSlot, d.when.locationOnSlot),
    },
  };
}

export function isLegacyNotifySettings(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return !isV2(raw as Record<string, unknown>);
}

export function anyDestOn(dest: NotifyDestinations): boolean {
  return dest.discordReports || dest.discordLocation || dest.telegram;
}

export function destOn(
  settings: NotifySettings,
  event: NotifyEventKey,
  dest: NotifyDestKey,
  failCount = 1
): boolean {
  const row = settings.events[event];
  if (!row.destinations[dest]) return false;
  if (row.onlyIfFaults && failCount === 0) return false;
  if (event === "locationCheckIn") return settings.when.locationOnSlot;
  return settings.when.submitImmediate;
}

export function eventFires(settings: NotifySettings, event: NotifyEventKey, failCount = 1): boolean {
  return NOTIFY_DEST_KEYS.some((dest) => destOn(settings, event, dest, failCount));
}

export function includeDayNotesFor(
  settings: NotifySettings,
  dest: NotifyDestKey,
  failCount: number
): boolean {
  return destOn(settings, "dayNotes", dest, failCount);
}

export function shouldNotifySubmission(settings: NotifySettings, failCount: number): boolean {
  return eventFires(settings, "roundSubmit", failCount) || eventFires(settings, "dayNotes", failCount);
}

export function shouldSendLocation(settings: NotifySettings): boolean {
  return eventFires(settings, "locationCheckIn", 1);
}

export function normalizeNotifySettings(raw: unknown): NotifySettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = isV2(src) ? DEFAULT_NOTIFY_SETTINGS : migrateV1(src);
  const events = (src.events ?? {}) as Record<string, unknown>;
  const payload = (src.payload ?? {}) as Record<string, unknown>;
  const when = (src.when ?? {}) as Record<string, unknown>;
  if (!isV2(src)) {
    return {
      ...base,
      payload: {
        fullForm: flag(payload.fullForm, base.payload.fullForm),
        faultsOnly: flag(payload.faultsOnly, base.payload.faultsOnly),
        photos: flag(payload.photos, base.payload.photos),
        pdf: flag(payload.pdf, base.payload.pdf),
        satelliteImage: flag(payload.satelliteImage, base.payload.satelliteImage),
        coords: flag(payload.coords, base.payload.coords),
        name: flag(payload.name, base.payload.name),
        time: flag(payload.time, base.payload.time),
      },
    };
  }
  return {
    version: 2,
    events: {
      roundSubmit: eventRoute(events.roundSubmit, DEFAULT_NOTIFY_SETTINGS.events.roundSubmit),
      dayNotes: eventRoute(events.dayNotes, DEFAULT_NOTIFY_SETTINGS.events.dayNotes),
      locationCheckIn: eventRoute(
        events.locationCheckIn,
        DEFAULT_NOTIFY_SETTINGS.events.locationCheckIn
      ),
    },
    payload: {
      fullForm: flag(payload.fullForm, DEFAULT_NOTIFY_SETTINGS.payload.fullForm),
      faultsOnly: flag(payload.faultsOnly, DEFAULT_NOTIFY_SETTINGS.payload.faultsOnly),
      photos: flag(payload.photos, DEFAULT_NOTIFY_SETTINGS.payload.photos),
      pdf: flag(payload.pdf, DEFAULT_NOTIFY_SETTINGS.payload.pdf),
      satelliteImage: flag(payload.satelliteImage, DEFAULT_NOTIFY_SETTINGS.payload.satelliteImage),
      coords: flag(payload.coords, DEFAULT_NOTIFY_SETTINGS.payload.coords),
      name: flag(payload.name, DEFAULT_NOTIFY_SETTINGS.payload.name),
      time: flag(payload.time, DEFAULT_NOTIFY_SETTINGS.payload.time),
    },
    when: {
      submitImmediate: flag(when.submitImmediate, DEFAULT_NOTIFY_SETTINGS.when.submitImmediate),
      locationOnSlot: flag(when.locationOnSlot, DEFAULT_NOTIFY_SETTINGS.when.locationOnSlot),
    },
  };
}
