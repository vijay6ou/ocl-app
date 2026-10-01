import { jsonError, requireUser } from "@/lib/auth";
import { getSubmission } from "@/lib/store";
import { buildRecordPdf } from "@/lib/submission-pdf";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const submission = await getSubmission(id);
    if (!submission) {
      return new Response("Record not found.", { status: 404 });
    }
    const { bytes, filename } = await buildRecordPdf(submission);
    const safeName = filename.replace(/"/g, "");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
