import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { getCatalogue, saveCatalogue } from "@/lib/store";
import { isSafeSectionId } from "@/lib/section-ids";
import { validatePlantCatalogue } from "@/lib/validate";
import type { DayCatalogue, DaysData, PlantArea } from "@/lib/types";

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
    const body = (await req.json()) as {
      days?: DaysData;
      areas?: PlantArea[];
      sectionId?: string;
      section?: DayCatalogue;
    };
    const current = await getCatalogue();
    let days = body.days;
    if (!days && body.sectionId && body.section) {
      if (!isSafeSectionId(body.sectionId) || !current.days[body.sectionId]) {
        return NextResponse.json({ error: "That subsection is not on the plant catalogue." }, { status: 400 });
      }
      days = { ...current.days, [body.sectionId]: body.section };
    }
    if (!days) {
      return NextResponse.json(
        { error: "Catalogue days are required." },
        { status: 400 }
      );
    }
    const validated = validatePlantCatalogue(body.areas ?? current.areas, days);
    const catalogue = await saveCatalogue(validated.days, validated.areas);
    return NextResponse.json({ catalogue });
  } catch (err) {
    return jsonError(err);
  }
}
