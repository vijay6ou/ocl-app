import { jsonError, requireUser } from "@/lib/auth";
import { historyFilterFrom, queryVisibleSubmissions } from "@/lib/record-query";
import { buildRoundsWorkbook, excelFilename } from "@/lib/round-workbook";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const filter = historyFilterFrom(url);
    const rows = await queryVisibleSubmissions(user, filter);
    const bytes = await buildRoundsWorkbook(rows);
    const filename = excelFilename(filter.from, filter.to);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
