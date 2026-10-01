import { getPhoto } from "@/lib/store";
import { bakeUprightImage } from "@/lib/image-orient";
import { buildSubmissionPdf, type PdfPhoto } from "@/lib/report-pdf";
import { workingSectionLabel } from "@/lib/working-section";
import type { PhotoRef, Submission } from "@/lib/types";

export type { PdfPhoto };

export function pdfFilename(record: Submission) {
  const section = workingSectionLabel(record.meta)
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
  return `Adani-Cements-${record.meta.date}-${section || record.meta.day}.pdf`;
}

function collectPhotoRefs(record: Submission): PhotoRef[] {
  const refs: PhotoRef[] = [];
  if (record.selfie) refs.push(record.selfie);
  for (const st of Object.values(record.equip)) {
    for (const p of st.photos ?? []) refs.push(p);
  }
  for (const st of Object.values(record.common)) {
    for (const p of st.photos ?? []) refs.push(p);
  }
  for (const p of record.dayPhotos ?? []) refs.push(p);
  const seen = new Set<string>();
  return refs.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export async function loadRecordPhotos(record: Submission): Promise<PdfPhoto[]> {
  const loaded: PdfPhoto[] = [];
  for (const ref of collectPhotoRefs(record)) {
    try {
      const photo = await getPhoto(ref.id);
      if (photo) {
        const upright = bakeUprightImage(photo.bytes, photo.meta.mime);
        loaded.push({
          meta: { ...photo.meta, mime: upright.mime, size: upright.bytes.length },
          bytes: upright.bytes,
        });
      }
    } catch {
      /* missing photo must not block the PDF */
    }
  }
  return loaded;
}

/** Canonical plant PDF — same bytes for print, share, and Discord. */
export async function buildRecordPdf(record: Submission): Promise<{ bytes: Buffer; filename: string }> {
  const photos = await loadRecordPhotos(record);
  const bytes = await buildSubmissionPdf(record, photos);
  return { bytes, filename: pdfFilename(record) };
}
