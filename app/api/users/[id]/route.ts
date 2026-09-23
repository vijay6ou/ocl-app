import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { deleteUser, updateUser } from "@/lib/store";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireRole("admin");
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: string;
      role?: Role;
      password?: string;
      pin?: string;
      active?: boolean;
    };
    if (body.password && body.password.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (body.pin && !/^\d{4}$/.test(body.pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }
    const user = await updateUser(id, {
      name: body.name,
      role: body.role,
      password: body.password,
      pin: body.pin,
      active: body.active,
    });
    return NextResponse.json({ user });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireRole("admin");
    const { id } = await ctx.params;
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
