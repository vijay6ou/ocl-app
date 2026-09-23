import { jsonError, requireUser } from "@/lib/auth";
import { getPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const photo = await getPhoto(id);
    if (!photo) {
      return new Response("Photo not found.", { status: 404 });
    }
    const bytes = new Uint8Array(photo.bytes);
    return new Response(bytes, {
      headers: {
        "Content-Type": photo.meta.mime,
        "Content-Length": String(photo.bytes.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${photo.meta.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
