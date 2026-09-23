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
  equip: Equipment[];
  common: CommonGroup[];
};

export type DaysData = Record<DayKey, DayCatalogue>;

export type Catalogue = {
  version: string;
  updatedAt: string;
  days: DaysData;
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

export type PhotoKind = "running" | "stopped" | "remark" | "common" | "selfie";

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
  day: DayKey;
  dayLabel: string;
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
};

export type DraftState = {
  day: DayKey;
  savedAt: string;
  meta: {
    date: string;
    shift: ShiftCode | "";
    sup: string;
  };
  equip: Record<string, EquipState>;
  common: Record<string, CommonState>;
};
