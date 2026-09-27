import { NextResponse } from "next/server";
import { jsonError, requireRole, requireUser } from "@/lib/auth";
import { cloneSuperBlock, type SuperBlock } from "@/lib/equipment-blocks";
import { isSafeSectionId, newPlantId } from "@/lib/section-ids";
import { getBlocks, getSuperBlocks, saveSuperBlocks, upsertSuperBlock } from "@/lib/store";

export const dynamic = "force-dynamic";

function membersOf(body: Partial<SuperBlock>): SuperBlock["members"] {
  return (body.members ?? [])
    .map((m) => ({
      blockId: String(m.blockId ?? "").trim(),
      name: String(m.name ?? "").trim(),
      tag: String(m.tag ?? "").trim().slice(0, 16),
    }))
    .filter((m) => m.blockId);
}

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
    const body = (await req.json()) as Partial<SuperBlock> & { copyFrom?: string };
    if (body.copyFrom) {
      const current = await getSuperBlocks();
      const source = current.find((b) => b.id === body.copyFrom);
      if (!source) return NextResponse.json({ error: "That super block is not in the library." }, { status: 404 });
      const title = body.title?.trim() || `${source.title} (copy)`;
      const used = new Set(current.map((b) => b.id));
      const block = cloneSuperBlock(source, newPlantId(title, used, "kit"), title);
      if (!isSafeSectionId(block.id)) {
        return NextResponse.json({ error: "Could not make a valid super block id." }, { status: 400 });
      }
      const superBlocks = await upsertSuperBlock(block);
      return NextResponse.json({ superBlock: block, superBlocks }, { status: 201 });
    }
    const title = body.title?.trim() ?? "";
    if (!title) return NextResponse.json({ error: "Super block name is required." }, { status: 400 });
    const members = membersOf(body);
    if (members.length === 0) {
      return NextResponse.json({ error: "Add at least one motor or equipment type." }, { status: 400 });
    }
    const library = await getBlocks();
    const known = new Set(library.map((b) => b.id));
    if (members.some((m) => !known.has(m.blockId))) {
      return NextResponse.json({ error: "Every member must be an equipment type from the library." }, { status: 400 });
    }
    const current = await getSuperBlocks();
    const used = new Set(current.map((b) => b.id));
    const block: SuperBlock = {
      id: newPlantId(title, used, "kit"),
      title,
      summary: body.summary?.trim() ?? "",
      members,
    };
    if (!isSafeSectionId(block.id)) {
      return NextResponse.json({ error: "Could not make a valid super block id." }, { status: 400 });
    }
    const superBlocks = await upsertSuperBlock(block);
    return NextResponse.json({ superBlock: block, superBlocks }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole("admin");
    const body = (await req.json()) as { superBlock?: SuperBlock };
    if (!body.superBlock?.id || !body.superBlock.title?.trim()) {
      return NextResponse.json({ error: "Super block id and name are required." }, { status: 400 });
    }
    const members = membersOf(body.superBlock);
    if (members.length === 0) {
      return NextResponse.json({ error: "Add at least one motor or equipment type." }, { status: 400 });
    }
    const superBlocks = await upsertSuperBlock({
      ...body.superBlock,
      title: body.superBlock.title.trim(),
      members,
    });
    return NextResponse.json({ superBlocks });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole("admin");
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const current = await getSuperBlocks();
    const superBlocks = current.filter((b) => b.id !== id);
    await saveSuperBlocks(superBlocks);
    return NextResponse.json({ superBlocks });
  } catch (err) {
    return jsonError(err);
  }
}
