import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { deleteSubmission, getSubmission } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const submission = await getSubmission(id);
    if (!submission) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }
    return NextResponse.json({ submission });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireRole("admin");
    const { id } = await ctx.params;
    await deleteSubmission(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
