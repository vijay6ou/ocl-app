import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { EQUIPMENT_BLOCKS, type EquipmentBlock } from "@/lib/equipment-blocks";
import { isSafeSectionId, newPlantId } from "@/lib/section-ids";
import { getBlocks, getCatalogue, getSuperBlocks, saveBlocks, upsertBlock } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const [blocks, superBlocks] = await Promise.all([getBlocks(), getSuperBlocks()]);
    return NextResponse.json({ blocks, superBlocks });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as Partial<EquipmentBlock>;
    const title = body.title?.trim() ?? "";
    if (!title) return NextResponse.json({ error: "Block name is required." }, { status: 400 });
    const current = await getBlocks();
    const used = new Set(current.map((b) => b.id));
    const block: EquipmentBlock = {
      id: newPlantId(title, used, "blk"),
      family: body.family?.trim() || "Other",
      title,
      summary: body.summary?.trim() ?? "",
      parts: (body.parts ?? ["Main assembly"]).map((p) => String(p).trim()).filter(Boolean),
      isHT: Boolean(body.isHT),
      defaultTag: (body.defaultTag?.trim() || title.slice(0, 3).toUpperCase()).slice(0, 8),
      defaultName: body.defaultName?.trim() || title,
      params: body.params?.length
        ? body.params
        : [{ label: "Current", unit: "A", phases: true, limit: "≤ FLA" }],
      paramIds: body.paramIds?.length ? body.paramIds : ["current"],
      runningChecks: (body.runningChecks ?? ["Visual condition"]).map((s) => String(s).trim()).filter(Boolean),
      stoppedChecks: (body.stoppedChecks ?? ["Isolated"]).map((s) => String(s).trim()).filter(Boolean),
    };
    if (!isSafeSectionId(block.id)) {
      return NextResponse.json({ error: "Could not make a valid block id." }, { status: 400 });
    }
    const blocks = await upsertBlock(block);
    return NextResponse.json({ block, blocks }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as { block?: EquipmentBlock };
    if (!body.block?.id || !body.block.title?.trim()) {
      return NextResponse.json({ error: "Block id and name are required." }, { status: 400 });
    }
    const current = await getBlocks();
    if (!current.some((b) => b.id === body.block!.id) && !EQUIPMENT_BLOCKS.some((b) => b.id === body.block!.id)) {
      /* still allow update of a stored id */
    }
    const catalogue = await getCatalogue();
    void catalogue;
    const blocks = await upsertBlock({
      ...body.block,
      title: body.block.title.trim(),
      parts: body.block.parts.map((p) => String(p).trim()).filter(Boolean),
      runningChecks: body.block.runningChecks.map((s) => String(s).trim()).filter(Boolean),
      stoppedChecks: body.block.stoppedChecks.map((s) => String(s).trim()).filter(Boolean),
    });
    return NextResponse.json({ blocks, catalogue: await getCatalogue() });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole("admin");
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const current = await getBlocks();
    const used = Object.values((await getCatalogue()).days).some((d) =>
      d.equip.some((e) => e.blockId === id)
    );
    if (used) {
      return NextResponse.json(
        { error: "This block is on a working form. Remove those cards first." },
        { status: 400 }
      );
    }
    const blocks = current.filter((b) => b.id !== id);
    await saveBlocks(blocks);
    return NextResponse.json({ blocks });
  } catch (err) {
    return jsonError(err);
  }
}
