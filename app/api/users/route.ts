import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { createUser, listUsers } from "@/lib/store";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ users: [user] });
    }
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as {
      username?: string;
      name?: string;
      role?: Role;
      password?: string;
      pin?: string;
    };
    const username = body.username?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const password = body.password ?? "";
    const pin = body.pin?.trim() ?? "";
    const role: Role = body.role === "admin" ? "admin" : "technician";
    if (!username || !name || password.length < 8) {
      return NextResponse.json(
        {
          error:
            "Name, username, and a password of at least 8 characters are required.",
        },
        { status: 400 }
      );
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }
    const user = await createUser({ username, name, role, password, pin });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
