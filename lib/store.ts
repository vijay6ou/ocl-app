import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import seedDays from "@/lib/seed/all-days-data.json";
import { SEED_ACCOUNTS } from "@/lib/constants";
import { isFourDigitPin, PIN_LOCK_MS, PIN_MAX_FAILS, SEED_PINS } from "@/lib/seed-pins";
import { bakeUprightImage } from "@/lib/image-orient";
import type {
  Catalogue,
  DayKey,
  DaysData,
  DraftState,
  PhotoMeta,
  PublicUser,
  SessionRecord,
  Submission,
  UserRecord,
} from "@/lib/types";

export type DiscordThread = { threadId: string; updatedAt: string };

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CATALOGUE_FILE = path.join(DATA_DIR, "catalogue.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const PHOTOS_FILE = path.join(DATA_DIR, "photos.json");
const DRAFTS_FILE = path.join(DATA_DIR, "drafts.json");
const DISCORD_THREADS_FILE = path.join(DATA_DIR, "discord-threads.json");

type FileStore = {
  catalogue: Catalogue;
  users: UserRecord[];
  sessions: SessionRecord[];
  submissions: Submission[];
  photos: PhotoMeta[];
};

let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function seedIfNeeded() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const catalogueExists = await fs
    .access(CATALOGUE_FILE)
    .then(() => true)
    .catch(() => false);

  if (!catalogueExists) {
    const now = new Date().toISOString();
    const catalogue: Catalogue = {
      version: now,
      updatedAt: now,
      days: seedDays as DaysData,
    };
    await writeJson(CATALOGUE_FILE, catalogue);
  }

  const usersExist = await fs
    .access(USERS_FILE)
    .then(() => true)
    .catch(() => false);

  if (!usersExist) {
    const now = new Date().toISOString();
    const users: UserRecord[] = [];
    for (const account of SEED_ACCOUNTS) {
      const pin = SEED_PINS[account.username];
      users.push({
        id: crypto.randomUUID(),
        username: account.username,
        name: account.name,
        role: account.role,
        passwordHash: await bcrypt.hash(account.password, 10),
        pinHash: pin ? await bcrypt.hash(pin, 10) : undefined,
        pinFailedAttempts: 0,
        active: true,
        createdAt: now,
      });
    }
    await writeJson(USERS_FILE, users);
  }

  const sessionsExist = await fs
    .access(SESSIONS_FILE)
    .then(() => true)
    .catch(() => false);
  if (!sessionsExist) await writeJson(SESSIONS_FILE, []);

  const submissionsExist = await fs
    .access(SUBMISSIONS_FILE)
    .then(() => true)
    .catch(() => false);
  if (!submissionsExist) await writeJson(SUBMISSIONS_FILE, []);

  const photosExist = await fs
    .access(PHOTOS_FILE)
    .then(() => true)
    .catch(() => false);
  if (!photosExist) await writeJson(PHOTOS_FILE, []);

  const draftsExist = await fs.access(DRAFTS_FILE).then(() => true).catch(() => false);
  if (!draftsExist) await writeJson(DRAFTS_FILE, {});

  const threadsExist = await fs
    .access(DISCORD_THREADS_FILE)
    .then(() => true)
    .catch(() => false);
  if (!threadsExist) await writeJson(DISCORD_THREADS_FILE, {});

  await migrateUserPins();
}

async function migrateUserPins() {
  const users = await readJson<UserRecord[]>(USERS_FILE, []);
  let changed = false;
  const next: UserRecord[] = [];
  for (const user of users) {
    if (user.pinHash) {
      next.push(user);
      continue;
    }
    const pin = SEED_PINS[user.username];
    if (!pin) {
      next.push(user);
      continue;
    }
    next.push({
      ...user,
      pinHash: await bcrypt.hash(pin, 10),
      pinFailedAttempts: 0,
      pinLockedUntil: undefined,
    });
    changed = true;
  }
  if (changed) await writeJson(USERS_FILE, next);
}

async function loadAll(): Promise<FileStore> {
  await seedIfNeeded();
  const [catalogue, users, sessions, submissions, photos] = await Promise.all([
    readJson<Catalogue>(CATALOGUE_FILE, {
      version: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      days: seedDays as DaysData,
    }),
    readJson<UserRecord[]>(USERS_FILE, []),
    readJson<SessionRecord[]>(SESSIONS_FILE, []),
    readJson<Submission[]>(SUBMISSIONS_FILE, []),
    readJson<PhotoMeta[]>(PHOTOS_FILE, []),
  ]);
  return { catalogue, users, sessions, submissions, photos };
}

export function publicUser(user: UserRecord): PublicUser {
  const { passwordHash: _pw, pinHash: _pin, pinFailedAttempts: _fails, pinLockedUntil: _lock, ...rest } =
    user;
  void _pw;
  void _pin;
  void _fails;
  void _lock;
  return { ...rest, pinSet: Boolean(user.pinHash) };
}

export async function getCatalogue() {
  return withLock(async () => (await loadAll()).catalogue);
}

export async function saveCatalogue(days: DaysData) {
  return withLock(async () => {
    const now = new Date().toISOString();
    const catalogue: Catalogue = { version: now, updatedAt: now, days };
    await writeJson(CATALOGUE_FILE, catalogue);
    return catalogue;
  });
}

export async function listUsers() {
  return withLock(async () => (await loadAll()).users.map(publicUser));
}

export async function findUserByUsername(username: string) {
  return withLock(async () => {
    const { users } = await loadAll();
    return (
      users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase()
      ) ?? null
    );
  });
}

export async function findUserById(id: string) {
  return withLock(async () => {
    const { users } = await loadAll();
    return users.find((u) => u.id === id) ?? null;
  });
}

export async function createUser(input: {
  username: string;
  name: string;
  role: UserRecord["role"];
  password: string;
  pin: string;
}) {
  return withLock(async () => {
    const store = await loadAll();
    if (
      store.users.some(
        (u) => u.username.toLowerCase() === input.username.trim().toLowerCase()
      )
    ) {
      throw new Error("That username is already in use.");
    }
    if (!input.pin || !isFourDigitPin(input.pin)) {
      throw new Error("PIN must be exactly 4 digits.");
    }
    const user: UserRecord = {
      id: crypto.randomUUID(),
      username: input.username.trim().toLowerCase(),
      name: input.name.trim(),
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 10),
      pinHash: await bcrypt.hash(input.pin, 10),
      pinFailedAttempts: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    await writeJson(USERS_FILE, store.users);
    return publicUser(user);
  });
}

export async function updateUser(
  id: string,
  patch: {
    name?: string;
    role?: UserRecord["role"];
    password?: string;
    pin?: string;
    active?: boolean;
  }
) {
  return withLock(async () => {
    const store = await loadAll();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx < 0) throw new Error("Person not found.");
    const current = store.users[idx];
    if (patch.active === false && current.role === "admin") {
      const otherAdmins = store.users.filter(
        (u) => u.role === "admin" && u.active && u.id !== id
      );
      if (otherAdmins.length === 0) {
        throw new Error("Keep at least one active admin account.");
      }
    }
    if (patch.pin && !isFourDigitPin(patch.pin)) {
      throw new Error("PIN must be exactly 4 digits.");
    }
    const next: UserRecord = {
      ...current,
      name: patch.name?.trim() || current.name,
      role: patch.role ?? current.role,
      active: patch.active ?? current.active,
      passwordHash: patch.password
        ? await bcrypt.hash(patch.password, 10)
        : current.passwordHash,
      pinHash: patch.pin ? await bcrypt.hash(patch.pin, 10) : current.pinHash,
      pinFailedAttempts: patch.pin ? 0 : current.pinFailedAttempts,
      pinLockedUntil: patch.pin ? undefined : current.pinLockedUntil,
    };
    store.users[idx] = next;
    await writeJson(USERS_FILE, store.users);
    return publicUser(next);
  });
}

export async function verifyPin(userId: string, pin: string) {
  return withLock(async () => {
    await seedIfNeeded();
    const users = await readJson<UserRecord[]>(USERS_FILE, []);
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) return { ok: false as const, error: "Account not found." };
    const user = users[idx];
    if (user.pinLockedUntil && new Date(user.pinLockedUntil).getTime() > Date.now()) {
      return {
        ok: false as const,
        locked: true,
        error: "PIN is locked after too many attempts. Try again later.",
      };
    }
    if (!user.pinHash) {
      return {
        ok: false as const,
        error: "No PIN is set. Ask an admin to set it in People.",
      };
    }
    if (!isFourDigitPin(pin)) {
      return { ok: false as const, error: "Enter the 4-digit PIN." };
    }
    const match = await bcrypt.compare(pin, user.pinHash);
    if (!match) {
      const fails = (user.pinFailedAttempts ?? 0) + 1;
      const locked = fails >= PIN_MAX_FAILS;
      users[idx] = {
        ...user,
        pinFailedAttempts: fails,
        pinLockedUntil: locked ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : undefined,
      };
      await writeJson(USERS_FILE, users);
      return {
        ok: false as const,
        remaining: Math.max(0, PIN_MAX_FAILS - fails),
        locked,
        error: locked
          ? "PIN locked after too many attempts. Try again in 15 minutes."
          : `Wrong PIN. ${Math.max(0, PIN_MAX_FAILS - fails)} tries left.`,
      };
    }
    users[idx] = { ...user, pinFailedAttempts: 0, pinLockedUntil: undefined };
    await writeJson(USERS_FILE, users);
    return { ok: true as const };
  });
}

export async function deleteUser(id: string) {
  return withLock(async () => {
    const store = await loadAll();
    const user = store.users.find((u) => u.id === id);
    if (!user) throw new Error("Person not found.");
    if (user.role === "admin") {
      const otherAdmins = store.users.filter(
        (u) => u.role === "admin" && u.active && u.id !== id
      );
      if (otherAdmins.length === 0) {
        throw new Error("Keep at least one active admin account.");
      }
    }
    store.users = store.users.filter((u) => u.id !== id);
    store.sessions = store.sessions.filter((s) => s.userId !== id);
    await writeJson(USERS_FILE, store.users);
    await writeJson(SESSIONS_FILE, store.sessions);
  });
}

export async function createSession(userId: string) {
  return withLock(async () => {
    const store = await loadAll();
    const session: SessionRecord = {
      token: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        "hex"
      ),
      userId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
    store.sessions.push(session);
    await writeJson(SESSIONS_FILE, store.sessions);
    return session;
  });
}

export async function getSession(token: string) {
  return withLock(async () => {
    const store = await loadAll();
    const session = store.sessions.find((s) => s.token === token);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      store.sessions = store.sessions.filter((s) => s.token !== token);
      await writeJson(SESSIONS_FILE, store.sessions);
      return null;
    }
    return session;
  });
}

export async function deleteSession(token: string) {
  return withLock(async () => {
    const store = await loadAll();
    store.sessions = store.sessions.filter((s) => s.token !== token);
    await writeJson(SESSIONS_FILE, store.sessions);
  });
}

export async function listSubmissions() {
  return withLock(async () => {
    const { submissions } = await loadAll();
    return [...submissions].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  });
}

export async function getSubmission(id: string) {
  return withLock(async () => {
    const { submissions } = await loadAll();
    return submissions.find((s) => s.id === id) ?? null;
  });
}

export async function saveSubmission(record: Submission) {
  return withLock(async () => {
    const store = await loadAll();
    store.submissions.unshift(record);
    await writeJson(SUBMISSIONS_FILE, store.submissions);
    return record;
  });
}

export async function deleteSubmission(id: string) {
  return withLock(async () => {
    const store = await loadAll();
    const exists = store.submissions.some((s) => s.id === id);
    if (!exists) throw new Error("Record not found.");
    store.submissions = store.submissions.filter((s) => s.id !== id);
    await writeJson(SUBMISSIONS_FILE, store.submissions);
  });
}

export async function savePhotoFile(
  meta: PhotoMeta,
  bytes: Buffer
): Promise<PhotoMeta> {
  return withLock(async () => {
    const upright = bakeUprightImage(bytes, meta.mime);
    const store = await loadAll();
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, meta.id), upright.bytes);
    const saved: PhotoMeta = { ...meta, mime: upright.mime, size: upright.bytes.length };
    store.photos.push(saved);
    await writeJson(PHOTOS_FILE, store.photos);
    return saved;
  });
}

export async function getPhoto(id: string) {
  return withLock(async () => {
    const store = await loadAll();
    const meta = store.photos.find((p) => p.id === id);
    if (!meta) return null;
    const bytes = await fs.readFile(path.join(UPLOAD_DIR, meta.id));
    return { meta, bytes };
  });
}

function draftKey(userId: string, day: DayKey) {
  return `${userId}:${day}`;
}

export async function getDraft(userId: string, day: DayKey): Promise<DraftState | null> {
  return withLock(async () => {
    await seedIfNeeded();
    const all = await readJson<Record<string, DraftState>>(DRAFTS_FILE, {});
    return all[draftKey(userId, day)] ?? null;
  });
}

export async function saveDraft(userId: string, draft: DraftState): Promise<DraftState> {
  return withLock(async () => {
    await seedIfNeeded();
    const all = await readJson<Record<string, DraftState>>(DRAFTS_FILE, {});
    const next = { ...draft, savedAt: new Date().toISOString() };
    all[draftKey(userId, draft.day)] = next;
    await writeJson(DRAFTS_FILE, all);
    return next;
  });
}

export async function deleteDraft(userId: string, day: DayKey) {
  return withLock(async () => {
    await seedIfNeeded();
    const all = await readJson<Record<string, DraftState>>(DRAFTS_FILE, {});
    delete all[draftKey(userId, day)];
    await writeJson(DRAFTS_FILE, all);
  });
}

export async function getDiscordThread(date: string): Promise<DiscordThread | null> {
  return withLock(async () => {
    await seedIfNeeded();
    const all = await readJson<Record<string, DiscordThread>>(DISCORD_THREADS_FILE, {});
    return all[date] ?? null;
  });
}

export async function saveDiscordThread(date: string, threadId: string) {
  return withLock(async () => {
    await seedIfNeeded();
    const all = await readJson<Record<string, DiscordThread>>(DISCORD_THREADS_FILE, {});
    all[date] = { threadId, updatedAt: new Date().toISOString() };
    await writeJson(DISCORD_THREADS_FILE, all);
    return all[date];
  });
}

export async function clearDiscordThread(date: string) {
  return withLock(async () => {
    await seedIfNeeded();
    const all = await readJson<Record<string, DiscordThread>>(DISCORD_THREADS_FILE, {});
    delete all[date];
    await writeJson(DISCORD_THREADS_FILE, all);
  });
}
