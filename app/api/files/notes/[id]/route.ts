import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { canSeeArea } from "@/lib/hierarchy";
import { getCatalogue, getFileNote } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const note = await getFileNote(id);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }
    if (note.areaId) {
      const catalogue = await getCatalogue();
      if (user.role !== "admin" && !canSeeArea(user, catalogue, note.areaId)) {
        return NextResponse.json({ error: "You are not assigned to that area." }, { status: 403 });
      }
    } else if (user.role !== "admin") {
      return NextResponse.json({ error: "You are not assigned to that area." }, { status: 403 });
    }
    return NextResponse.json({ note });
  } catch (err) {
    return jsonError(err);
  }
}
