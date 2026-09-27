import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { filterCatalogueForUser } from "@/lib/hierarchy";
import { getBlocks, getCatalogue, saveCatalogue } from "@/lib/store";
import { isSafeSectionId } from "@/lib/section-ids";
import { validatePlantCatalogue } from "@/lib/validate";
import type { DayCatalogue, DaysData, Plant, PlantSection } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [full, blocks] = await Promise.all([getCatalogue(), getBlocks()]);
    const catalogue = filterCatalogueForUser(user, full);
    return NextResponse.json({ catalogue, blocks });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as {
      days?: DaysData;
      plants?: Plant[];
      sections?: PlantSection[];
      sectionId?: string;
      section?: DayCatalogue;
    };
    const current = await getCatalogue();
    let days = body.days;
    if (!days && body.sectionId && body.section) {
      if (!isSafeSectionId(body.sectionId) || !current.days[body.sectionId]) {
        return NextResponse.json({ error: "That area is not on the plant catalogue." }, { status: 400 });
      }
      days = { ...current.days, [body.sectionId]: body.section };
    }
    if (!days) {
      return NextResponse.json({ error: "Catalogue days are required." }, { status: 400 });
    }
    const validated = validatePlantCatalogue({
      plants: body.plants ?? current.plants,
      sections: body.sections ?? current.sections,
      days,
    });
    const catalogue = await saveCatalogue(validated.days, {
      plants: validated.plants,
      sections: validated.sections,
    });
    const blocks = await getBlocks();
    return NextResponse.json({ catalogue, blocks });
  } catch (err) {
    return jsonError(err);
  }
}
