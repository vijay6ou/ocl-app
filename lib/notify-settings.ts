export type NotifySettings = {
  destinations: {
    discordReports: boolean;
    discordLocation: boolean;
    telegram: boolean;
  };
  events: {
    roundSubmit: boolean;
    dayNotes: boolean;
    locationCheckIn: boolean;
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
    onlyIfFaults: boolean;
  };
};

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  destinations: {
    discordReports: true,
    discordLocation: true,
    telegram: true,
  },
  events: {
    roundSubmit: true,
    dayNotes: true,
    locationCheckIn: true,
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
    onlyIfFaults: false,
  },
};

function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return fallback;
}

export function normalizeNotifySettings(raw: unknown): NotifySettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const dest = (src.destinations ?? {}) as Record<string, unknown>;
  const events = (src.events ?? {}) as Record<string, unknown>;
  const payload = (src.payload ?? {}) as Record<string, unknown>;
  const when = (src.when ?? {}) as Record<string, unknown>;
  const d = DEFAULT_NOTIFY_SETTINGS;
  return {
    destinations: {
      discordReports: flag(dest.discordReports, d.destinations.discordReports),
      discordLocation: flag(dest.discordLocation, d.destinations.discordLocation),
      telegram: flag(dest.telegram, d.destinations.telegram),
    },
    events: {
      roundSubmit: flag(events.roundSubmit, d.events.roundSubmit),
      dayNotes: flag(events.dayNotes, d.events.dayNotes),
      locationCheckIn: flag(events.locationCheckIn, d.events.locationCheckIn),
    },
    payload: {
      fullForm: flag(payload.fullForm, d.payload.fullForm),
      faultsOnly: flag(payload.faultsOnly, d.payload.faultsOnly),
      photos: flag(payload.photos, d.payload.photos),
      pdf: flag(payload.pdf, d.payload.pdf),
      satelliteImage: flag(payload.satelliteImage, d.payload.satelliteImage),
      coords: flag(payload.coords, d.payload.coords),
      name: flag(payload.name, d.payload.name),
      time: flag(payload.time, d.payload.time),
    },
    when: {
      submitImmediate: flag(when.submitImmediate, d.when.submitImmediate),
      locationOnSlot: flag(when.locationOnSlot, d.when.locationOnSlot),
      onlyIfFaults: flag(when.onlyIfFaults, d.when.onlyIfFaults),
    },
  };
}

export function shouldSendRoundSubmit(settings: NotifySettings, failCount: number) {
  if (!settings.events.roundSubmit) return false;
  if (!settings.when.submitImmediate) return false;
  if (settings.when.onlyIfFaults && failCount === 0) return false;
  return true;
}

export function shouldSendLocation(settings: NotifySettings) {
  return (
    settings.destinations.discordLocation &&
    settings.events.locationCheckIn &&
    settings.when.locationOnSlot
  );
}
