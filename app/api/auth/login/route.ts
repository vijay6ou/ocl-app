import { NextResponse } from "next/server";
import { jsonError, loginWithPassword } from "@/lib/auth";
import { sanitizePublicText } from "@/lib/public-text";

export const dynamic = "force-dynamic";

function originFrom(req: Request) {
  const host = req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function safeNext(value: string | null | undefined) {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/days";
}

async function readCredentials(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      next?: string;
    };
    return {
      username: body.username?.trim() ?? "",
      password: body.password ?? "",
      next: safeNext(body.next),
      form: false,
    };
  }
  const form = await req.formData();
  return {
    username: String(form.get("username") ?? "").trim(),
    password: String(form.get("password") ?? ""),
    next: safeNext(String(form.get("next") ?? "")),
    form: true,
  };
}

export async function POST(req: Request) {
  try {
    const { username, password, form, next } = await readCredentials(req);
    if (!username || !password) {
      if (form) {
        const url = new URL("/login", originFrom(req));
        url.searchParams.set("error", "Enter your username and password.");
        return NextResponse.redirect(url);
      }
      return NextResponse.json(
        { error: "Enter your username and password." },
        { status: 400 }
      );
    }
    const user = await loginWithPassword(username, password);
    if (form) {
      return NextResponse.redirect(`${originFrom(req)}${next}`, 303);
    }
    return NextResponse.json({ user });
  } catch (err) {
    const contentType = req.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const url = new URL("/login", originFrom(req));
      const message = sanitizePublicText(
        err instanceof Error ? err.message : "Username or password is not recognised.",
        "Username or password is not recognised."
      );
      url.searchParams.set("error", message);
      return NextResponse.redirect(url);
    }
    return jsonError(err);
  }
}
