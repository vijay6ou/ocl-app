import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { getCatalogue, saveCatalogue } from "@/lib/store";
import { validateDays } from "@/lib/validate";
import type { DaysData } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const catalogue = await getCatalogue();
    return NextResponse.json({ catalogue });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as { days?: DaysData };
    if (!body.days) {
      return NextResponse.json(
        { error: "Catalogue days are required." },
        { status: 400 }
      );
    }
    const days = validateDays(body.days);
    const catalogue = await saveCatalogue(days);
    return NextResponse.json({ catalogue });
  } catch (err) {
    return jsonError(err);
  }
}
