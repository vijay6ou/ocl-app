import { plantCalendarDate } from "@/lib/submit-time";
import type { PresenceSession, Role } from "@/lib/types";

export const PRESENCE_ONLINE_MS = 2 * 60 * 1000;

export type PresencePerson = {
  userId: string;
  username: string;
  name: string;
  role: Role;
  signedInAt: string;
  lastSeenAt: string;
  durationMs: number;
  online: boolean;
};

export type PresenceSummary = {
  generatedAt: string;
  onlineCount: number;
  online: PresencePerson[];
  today: PresencePerson[];
  recent: PresencePerson[];
};

export function sessionDurationMs(session: PresenceSession, now = Date.now()) {
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt || session.lastSeenAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.min(end, now) - start);
}

export function isPresenceOnline(session: PresenceSession, now = Date.now()) {
  if (session.endedAt) return false;
  const last = Date.parse(session.lastSeenAt);
  return Number.isFinite(last) && now - last <= PRESENCE_ONLINE_MS;
}

function toPerson(session: PresenceSession, now: number, durationMs?: number): PresencePerson {
  return {
    userId: session.userId,
    username: session.username,
    name: session.name,
    role: session.role,
    signedInAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
    durationMs: durationMs ?? sessionDurationMs(session, now),
    online: isPresenceOnline(session, now),
  };
}

export function summarizePresence(sessions: PresenceSession[]): PresenceSummary {
  const now = Date.now();
  const today = plantCalendarDate(new Date().toISOString());
  const online: PresencePerson[] = [];
  const seenOnline = new Set<string>();
  for (const session of sessions) {
    if (!isPresenceOnline(session, now) || seenOnline.has(session.userId)) continue;
    seenOnline.add(session.userId);
    online.push(toPerson(session, now));
  }
  online.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  const todayByUser = new Map<
    string,
    { session: PresenceSession; durationMs: number }
  >();
  for (const session of sessions) {
    const startDay = plantCalendarDate(session.startedAt);
    const lastDay = plantCalendarDate(session.lastSeenAt);
    if (startDay !== today && lastDay !== today) continue;
    const durationMs = sessionDurationMs(session, now);
    const current = todayByUser.get(session.userId);
    if (!current) {
      todayByUser.set(session.userId, { session, durationMs });
      continue;
    }
    current.durationMs += durationMs;
    if (session.lastSeenAt > current.session.lastSeenAt) current.session = session;
  }
  const todayPeople = [...todayByUser.values()]
    .map(({ session, durationMs }) => toPerson(session, now, durationMs))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  const recent = sessions.slice(0, 40).map((session) => toPerson(session, now));

  return {
    generatedAt: new Date().toISOString(),
    onlineCount: online.length,
    online,
    today: todayPeople,
    recent,
  };
}
