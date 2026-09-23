import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { PHOTO_MAX_BYTES } from "@/lib/constants";
import { savePhotoFile } from "@/lib/store";
import type { PhotoKind, PhotoMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Attach a photo of the defect." },
        { status: 400 }
      );
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files can be attached." },
        { status: 400 }
      );
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return NextResponse.json(
        { error: "Photo is too large. Keep it under 8 MB." },
        { status: 400 }
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = (form.get("kind") as PhotoKind) || "remark";
    const checkRaw = form.get("checkIndex");
    const meta: PhotoMeta = {
      id: crypto.randomUUID(),
      filename: file.name || "defect.jpg",
      mime: file.type || "image/jpeg",
      size: file.size,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
      equipmentId: String(form.get("equipmentId") || "") || undefined,
      commonId: String(form.get("commonId") || "") || undefined,
      kind,
      checkIndex:
        checkRaw === null || checkRaw === ""
          ? undefined
          : Number(checkRaw),
    };
    await savePhotoFile(meta, bytes);
    return NextResponse.json({
      photo: {
        id: meta.id,
        equipmentId: meta.equipmentId,
        commonId: meta.commonId,
        kind: meta.kind,
        checkIndex: meta.checkIndex,
        url: `/api/photos/${meta.id}`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
