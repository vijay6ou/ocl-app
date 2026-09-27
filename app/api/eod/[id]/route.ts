import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { canSeeArea } from "@/lib/hierarchy";
import { deleteEodNote, getCatalogue, getEodNote } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const note = await getEodNote(id);
    if (!note) return NextResponse.json({ error: "Handover not found." }, { status: 404 });
    if (user.role !== "admin" && note.techId !== user.id) {
      const catalogue = await getCatalogue();
      const shared =
        note.status === "SUBMITTED" && note.areaId && canSeeArea(user, catalogue, note.areaId);
      if (!shared) return NextResponse.json({ error: "Handover not found." }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const note = await getEodNote(id);
    if (!note) return NextResponse.json({ error: "Handover not found." }, { status: 404 });
    if (user.role !== "admin" && note.techId !== user.id) {
      return NextResponse.json({ error: "You can only delete your own handover." }, { status: 403 });
    }
    if (note.status === "SUBMITTED" && user.role !== "admin") {
      return NextResponse.json({ error: "A submitted handover stays on the plant." }, { status: 400 });
    }
    await deleteEodNote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
