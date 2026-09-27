import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { badgeFromName, emptyArea, newPlantId } from "@/lib/hierarchy";
import { getCatalogue, saveCatalogue } from "@/lib/store";
import { validatePlantCatalogue } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Body =
  | { action: "add-plant"; name: string }
  | { action: "add-section"; plantId: string; name: string }
  | { action: "add-area"; sectionId: string; name: string }
  | { action: "rename-plant"; id: string; name: string }
  | { action: "rename-section"; id: string; name: string }
  | { action: "remove-plant"; id: string }
  | { action: "remove-section"; id: string }
  | { action: "remove-area"; id: string };

export async function POST(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as Body;
    const current = await getCatalogue();
    const used = new Set([
      ...current.plants.map((p) => p.id),
      ...current.sections.map((s) => s.id),
      ...Object.keys(current.days),
    ]);

    let plants = current.plants.map((p) => ({ ...p }));
    let sections = current.sections.map((s) => ({ ...s, areaIds: [...s.areaIds] }));
    let days = { ...current.days };

    if (body.action === "add-plant") {
      const name = body.name?.trim();
      if (!name) return NextResponse.json({ error: "Plant name is required." }, { status: 400 });
      plants.push({ id: newPlantId(name, used, "plant"), name });
    } else if (body.action === "add-section") {
      const name = body.name?.trim();
      if (!name) return NextResponse.json({ error: "Section name is required." }, { status: 400 });
      if (!plants.some((p) => p.id === body.plantId)) {
        return NextResponse.json({ error: "Unknown plant." }, { status: 400 });
      }
      sections.push({
        id: newPlantId(name, used, "section"),
        plantId: body.plantId,
        name,
        blurb: "",
        areaIds: [],
      });
    } else if (body.action === "add-area") {
      const name = body.name?.trim();
      if (!name) return NextResponse.json({ error: "Area name is required." }, { status: 400 });
      const section = sections.find((s) => s.id === body.sectionId);
      if (!section) return NextResponse.json({ error: "Unknown section." }, { status: 400 });
      const id = newPlantId(name, used, "area");
      const badge = badgeFromName(name);
      days[id] = emptyArea({
        label: name,
        formLabel: `${section.name} – ${name}`,
        badge,
        blurb: "",
      });
      section.areaIds.push(id);
    } else if (body.action === "rename-plant") {
      const name = body.name?.trim();
      if (!name) return NextResponse.json({ error: "Plant name is required." }, { status: 400 });
      plants = plants.map((p) => (p.id === body.id ? { ...p, name } : p));
    } else if (body.action === "rename-section") {
      const name = body.name?.trim();
      if (!name) return NextResponse.json({ error: "Section name is required." }, { status: 400 });
      sections = sections.map((s) => (s.id === body.id ? { ...s, name } : s));
    } else if (body.action === "remove-plant") {
      const plant = plants.find((p) => p.id === body.id);
      if (!plant) return NextResponse.json({ error: "Unknown plant." }, { status: 400 });
      if (sections.some((s) => s.plantId === body.id)) {
        return NextResponse.json({ error: "Remove this plant’s sections first." }, { status: 400 });
      }
      if (plants.length === 1) {
        return NextResponse.json({ error: "Keep at least one plant." }, { status: 400 });
      }
      plants = plants.filter((p) => p.id !== body.id);
    } else if (body.action === "remove-section") {
      const section = sections.find((s) => s.id === body.id);
      if (!section) return NextResponse.json({ error: "Unknown section." }, { status: 400 });
      if (section.areaIds.length) {
        return NextResponse.json({ error: "Remove this section’s areas first." }, { status: 400 });
      }
      sections = sections.filter((s) => s.id !== body.id);
    } else if (body.action === "remove-area") {
      const section = sections.find((s) => s.areaIds.includes(body.id));
      if (!section || !days[body.id]) {
        return NextResponse.json({ error: "Unknown area." }, { status: 400 });
      }
      section.areaIds = section.areaIds.filter((id) => id !== body.id);
      const { [body.id]: _drop, ...rest } = days;
      void _drop;
      days = rest;
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const validated = validatePlantCatalogue({ plants, sections, days });
    const catalogue = await saveCatalogue(validated.days, {
      plants: validated.plants,
      sections: validated.sections,
    });
    return NextResponse.json({ catalogue });
  } catch (err) {
    return jsonError(err);
  }
}
