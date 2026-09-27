export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type RunningParam = {
  id: string;
  label: string;
  unit: string;
  phases: boolean;
  limit: string;
};

export type Equipment = {
  id: string;
  tag: string;
  name: string;
  isHT: boolean;
  /** Catalogue block this card was created from, when it was not a blank card. */
  blockId?: string;
  runningParams: RunningParam[];
  runningChecks: string[];
  stoppedChecks: string[];
};

export type CommonItem = {
  id: string;
  tag: string;
  device: string;
  check: string;
};

export type CommonGroup = {
  id: string;
  name: string;
  color: string;
  icon: string;
  items: CommonItem[];
};

export type DayCatalogue = {
  label: string;
  formLabel: string;
  /** Short card badge, for example ADD or Fan. */
  badge?: string;
  blurb?: string;
  equip: Equipment[];
  common: CommonGroup[];
};

export type Plant = {
  id: string;
  name: string;
};

export type PlantSection = {
  id: string;
  plantId: string;
  name: string;
  blurb?: string;
  areaIds: string[];
};

/** @deprecated Legacy flat grouping. Migrated to plants + sections. */
export type PlantArea = {
  id: string;
  name: string;
  blurb: string;
  sectionIds: string[];
};

export type DaysData = Record<string, DayCatalogue>;

export type Catalogue = {
  version: string;
  updatedAt: string;
  plants: Plant[];
  sections: PlantSection[];
  days: DaysData;
};

export type GrantKind = "plant" | "section" | "area";

export type AccessGrant = {
  kind: GrantKind;
  targetId: string;
};

export type Role = "admin" | "technician";

export type UserRecord = {
  id: string;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  pinHash?: string;
  pinFailedAttempts?: number;
  pinLockedUntil?: string;
  active: boolean;
  createdAt: string;
  grants?: AccessGrant[];
};

export type PublicUser = Omit<
  UserRecord,
  "passwordHash" | "pinHash" | "pinFailedAttempts" | "pinLockedUntil"
> & {
  pinSet: boolean;
};

export type SessionRecord = {
  token: string;
  userId: string;
  expiresAt: string;
};

export const SHIFT_OPTIONS = [
  { code: "A", label: "A (06:00–14:00)" },
  { code: "B", label: "B (14:00–22:00)" },
  { code: "C", label: "C (22:00–06:00)" },
  { code: "G", label: "General (09:00–18:00)" },
] as const;

export type ShiftCode = (typeof SHIFT_OPTIONS)[number]["code"];

export type EquipStatus = "R" | "S" | null;
export type CheckResult = "ok" | "fail" | null;

export type ParamValue = {
  r?: string;
  y?: string;
  b?: string;
  v?: string;
};

export type PhotoKind =
  | "running"
  | "stopped"
  | "remark"
  | "common"
  | "selfie"
  | "summary"
  | "album"
  | "nameplate";

export type PhotoSource = "form" | "album" | "summary";

export type PhotoMeta = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  equipmentId?: string;
  commonId?: string;
  kind: PhotoKind;
  checkIndex?: number;
  plantId?: string;
  plantName?: string;
  sectionId?: string;
  sectionName?: string;
  areaId?: string;
  areaName?: string;
  equipmentTag?: string;
  equipmentName?: string;
  commonTag?: string;
  commonName?: string;
  relPath?: string;
  source?: PhotoSource;
};

export type PhotoRef = {
  id: string;
  equipmentId?: string;
  commonId?: string;
  kind: PhotoKind;
  checkIndex?: number;
};

export type EquipState = {
  status: EquipStatus;
  params: Record<string, ParamValue>;
  checks: Record<string, CheckResult>;
  stoppedChecks: Record<string, CheckResult>;
  remarks: string;
  photos: PhotoRef[];
};

export type CommonState = {
  ok: CheckResult;
  remarks: string;
  photos: PhotoRef[];
};

export type SubmissionMeta = {
  date: string;
  shift: ShiftCode;
  shiftLabel: string;
  techId: string;
  tech: string;
  sup: string;
  form: string;
  /** Area id (Additive, Gypsum, …). Older records may still use mon–sat. */
  day: string;
  dayLabel: string;
  plantId?: string;
  plantName?: string;
  sectionId?: string;
  sectionName?: string;
  areaId?: string;
  areaName?: string;
  pct: number;
  done: number;
  total: number;
};

export type FailItem = {
  equipment: string;
  issue: string;
  type: "Running Check" | "Stopped Check" | "Remark" | "Common Device";
};

export type DaySnapshot = {
  label: string;
  formLabel: string;
  equip: Equipment[];
  common: CommonGroup[];
};

export type SubmissionStatus = "COMPLETE" | "PENDING";

export type Submission = {
  id: string;
  savedAt: string;
  /** Exact moment Submit succeeded (ISO). Falls back to savedAt on older records. */
  submittedAt?: string;
  status: SubmissionStatus;
  meta: SubmissionMeta;
  equip: Record<string, EquipState>;
  common: Record<string, CommonState>;
  fails: FailItem[];
  snapshot: DaySnapshot;
  selfie?: PhotoRef;
  dayNotes?: string;
  dayPhotos?: PhotoRef[];
};

export type LocationPing = {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: Role;
  lat: number;
  lng: number;
  accuracy?: number;
  slot: string;
  recordedAt: string;
  mapUrl: string;
  satelliteAttached: boolean;
};

export type PresenceSession = {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: Role;
  startedAt: string;
  lastSeenAt: string;
  endedAt?: string;
};

export type DraftState = {
  day: string;
  savedAt: string;
  meta: {
    date: string;
    shift: ShiftCode | "";
    sup: string;
  };
  equip: Record<string, EquipState>;
  common: Record<string, CommonState>;
  /** Plain end-of-round note, written just before submit. */
  dayNotes?: string;
  dayPhotos?: PhotoRef[];
};
