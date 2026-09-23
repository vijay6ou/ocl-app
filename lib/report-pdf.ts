import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe, workingSectionLabel } from "@/lib/working-section";
import { bakeUprightImage } from "@/lib/image-orient";
import { formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";
import type { PhotoMeta, Submission } from "@/lib/types";

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const NAVY = rgb(0.11, 0.27, 0.22);
const GOLD = rgb(0.77, 0.64, 0.22);
const MUTED = rgb(0.35, 0.38, 0.42);
const RULE = rgb(0.82, 0.84, 0.86);
const FAIL = rgb(0.62, 0.12, 0.12);

export type PdfPhoto = {
  meta: PhotoMeta;
  bytes: Buffer;
};

type Cursor = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
};

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        chunk = trial;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

function ensure(c: Cursor, need: number) {
  if (c.y - need >= 36) return;
  c.page = c.doc.addPage([PAGE.width, PAGE.height]);
  c.y = PAGE.height - MARGIN;
}

function line(c: Cursor, text: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number }) {
  const size = opts?.size ?? 10;
  const font = opts?.bold ? c.bold : c.font;
  const color = opts?.color ?? NAVY;
  const max = PAGE.width - MARGIN * 2;
  const lines = wrap(font, text, size, max);
  for (const row of lines) {
    ensure(c, size + 4);
    c.page.drawText(row, { x: MARGIN, y: c.y, size, font, color });
    c.y -= size + 3;
  }
  c.y -= opts?.gap ?? 2;
}

function rule(c: Cursor) {
  ensure(c, 10);
  c.page.drawRectangle({
    x: MARGIN,
    y: c.y,
    width: PAGE.width - MARGIN * 2,
    height: 1,
    color: RULE,
  });
  c.y -= 10;
}

export async function buildSubmissionPdf(record: Submission, photos: PdfPhoto[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const c: Cursor = { doc, page, font, bold, y: PAGE.height - MARGIN };
  const section = workingSectionLabel(record.meta);
  const photoById = new Map(photos.map((p) => [p.meta.id, p]));

  c.page.drawRectangle({
    x: 0,
    y: PAGE.height - 8,
    width: PAGE.width,
    height: 8,
    color: GOLD,
  });

  line(c, "ADANI CEMENTS", { size: 9, bold: true, color: GOLD, gap: 1 });
  line(c, "Electrical Department · Chittapur", { size: 9, color: MUTED, gap: 6 });
  line(c, "Weekly Electrical Maintenance Report", { size: 16, bold: true, gap: 6 });
  line(c, `Working section: ${section}`, { size: 13, bold: true, gap: 2 });
  line(c, `Date: ${record.meta.date}`, { size: 12, bold: true, gap: 2 });
  line(c, `Submitted: ${formatSubmitTimestamp(submitInstant(record))}`, { size: 11, bold: true, gap: 8 });
  rule(c);

  line(c, `Shift: ${record.meta.shiftLabel}`, { size: 10, gap: 1 });
  line(c, `Technician: ${record.meta.tech}`, { size: 10, gap: 1 });
  line(c, `Supervisor: ${record.meta.sup || "(blank)"}`, { size: 10, gap: 1 });
  line(
    c,
    `Completion: ${record.meta.pct}% (${record.meta.done}/${record.meta.total}) · ${record.status}`,
    { size: 10, gap: 1 }
  );
  line(c, `Record: ${record.id}`, { size: 10, color: MUTED, gap: 8 });
  const selfie = record.selfie ? photoById.get(record.selfie.id) : undefined;
  if (selfie) {
    line(c, "Technician selfie", { size: 10, bold: true, gap: 4 });
    await drawPhotos(c, [selfie]);
  }
  rule(c);

  if (record.fails.length > 0) {
    line(c, "Defects / failures", { size: 12, bold: true, color: FAIL, gap: 4 });
    for (const fail of record.fails) {
      line(c, `${fail.equipment} - ${fail.issue} (${fail.type})`, {
        size: 9,
        color: FAIL,
        gap: 2,
      });
    }
    c.y -= 6;
  } else {
    line(c, "No FAIL checks or defect remarks were recorded.", {
      size: 10,
      color: rgb(0.05, 0.4, 0.22),
      gap: 8,
    });
  }

  line(c, "Equipment", { size: 13, bold: true, gap: 6 });

  for (const item of record.snapshot.equip) {
    const st = record.equip[item.id];
    const status =
      st?.status === "R" ? "RUNNING" : st?.status === "S" ? "STOPPED" : "PENDING";
    ensure(c, 48);
    c.page.drawRectangle({
      x: MARGIN,
      y: c.y - 2,
      width: 4,
      height: 14,
      color: GOLD,
    });
    line(c, `${item.tag}${item.isHT ? "  HT" : ""}  ${item.name}  [${status}]`, {
      size: 11,
      bold: true,
      gap: 4,
    });

    if (st?.status === "R" && item.runningParams.length > 0) {
      for (const p of item.runningParams) {
        const v = st.params[p.id] ?? {};
        const shown = p.phases
          ? `R ${v.r || "-"} / Y ${v.y || "-"} / B ${v.b || "-"}`
          : v.v || "-";
        const unit = p.unit ? ` (${p.unit})` : "";
        const limit = p.limit ? `  limit ${p.limit}` : "";
        line(c, `${p.label}${unit}: ${shown}${limit}`, { size: 9, gap: 1 });
      }
      c.y -= 4;
    }

    const checks = st?.status === "S" ? item.stoppedChecks : item.runningChecks;
    const answers = st?.status === "S" ? st.stoppedChecks : st?.checks;
    if (st?.status && checks.length > 0) {
      for (let i = 0; i < checks.length; i += 1) {
        const ans = answers?.[String(i)];
        const mark = ans === "ok" ? "OK" : ans === "fail" ? "FAIL" : "-";
        line(c, `${mark} · ${checks[i]}`, {
          size: 9,
          color: ans === "fail" ? FAIL : NAVY,
          gap: 1,
        });
      }
      c.y -= 2;
    }

    if (st?.remarks) {
      line(c, `Remarks: ${st.remarks}`, { size: 9, color: FAIL, gap: 4 });
    }

    await drawPhotos(c, st?.photos?.map((p) => photoById.get(p.id)).filter(Boolean) as PdfPhoto[]);
    c.y -= 8;
  }

  line(c, "Common devices", { size: 13, bold: true, gap: 6 });
  for (const group of record.snapshot.common) {
    line(c, group.name, { size: 10, bold: true, color: MUTED, gap: 3 });
    for (const item of group.items) {
      const st = record.common[item.id];
      const ans = st?.ok === "ok" ? "OK" : st?.ok === "fail" ? "FAIL" : "-";
      const extra = st?.remarks ? ` · ${st.remarks}` : "";
      line(c, `${item.tag}  ${item.device}  ${ans}${extra}`, {
        size: 9,
        color: st?.ok === "fail" ? FAIL : NAVY,
        gap: 1,
      });
      await drawPhotos(
        c,
        st?.photos?.map((p) => photoById.get(p.id)).filter(Boolean) as PdfPhoto[]
      );
    }
    c.y -= 6;
  }

  ensure(c, 64);
  rule(c);
  line(c, `Technician signature: ${record.meta.tech}`, { size: 10, gap: 8 });
  line(c, `Supervisor signature: ${record.meta.sup || "____________________"}`, {
    size: 10,
    gap: 4,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function drawPhotos(c: Cursor, photos: PdfPhoto[] | undefined) {
  if (!photos?.length) return;
  for (const photo of photos) {
    try {
      const upright = bakeUprightImage(photo.bytes, photo.meta.mime);
      const payload = Uint8Array.from(upright.bytes);
      const mime = (upright.mime || "").toLowerCase();
      const image = mime.includes("png")
        ? await c.doc.embedPng(payload)
        : await c.doc.embedJpg(payload);
      const maxW = 180;
      const maxH = 120;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      ensure(c, h + 16);
      c.page.drawImage(image, { x: MARGIN, y: c.y - h, width: w, height: h });
      c.y -= h + 6;
      line(c, photo.meta.filename || "defect photo", { size: 8, color: MUTED, gap: 4 });
    } catch {
      line(c, `[photo ${photo.meta.filename || photo.meta.id} could not be embedded]`, {
        size: 8,
        color: MUTED,
        gap: 2,
      });
    }
  }
}
