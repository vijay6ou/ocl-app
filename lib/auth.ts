import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/constants";
import {
  createSession,
  deleteSession,
  findUserById,
  findUserByUsername,
  getSession,
  publicUser,
} from "@/lib/store";
import type { PublicUser, Role } from "@/lib/types";
import { sanitizePublicText } from "@/lib/public-text";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function loginWithPassword(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user || !user.active) {
    throw new HttpError(401, "Username or password is not recognised.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(401, "Username or password is not recognised.");
  }
  const session = await createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return publicUser(user);
}

export async function logoutCurrent() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getSession(token);
  if (!session) {
    jar.delete(SESSION_COOKIE);
    return null;
  }
  const user = await findUserById(session.userId);
  if (!user || !user.active) return null;
  return publicUser(user);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) {
    throw new HttpError(403, "Only an electrical admin can do that.");
  }
  return user;
}

export function jsonError(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json({ error: sanitizePublicText(err.message) }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return Response.json({ error: sanitizePublicText(message) }, { status: 400 });
}
