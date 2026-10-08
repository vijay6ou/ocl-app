import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  checkResultLabel,
  countChecks,
  countParams,
  machineStatusLabel,
  machineTallyLine,
  NOT_FILLED,
  NOT_WORKED,
  paramValueLabel,
} from "@/lib/fill-status";
import { pdfSafe, workingSectionLabel } from "@/lib/working-section";
import { bakeUprightImage } from "@/lib/image-orient";
import { formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";
import type { PhotoMeta, Submission } from "@/lib/types";

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT = PAGE.width - MARGIN * 2;
const NAVY = rgb(0.11, 0.27, 0.22);
const GOLD = rgb(0.77, 0.64, 0.22);
const MUTED = rgb(0.38, 0.42, 0.45);
const RULE = rgb(0.84, 0.86, 0.87);
const FAIL = rgb(0.62, 0.12, 0.12);
const OK = rgb(0.05, 0.4, 0.22);
const SKIP = rgb(0.42, 0.45, 0.48);
const BAND = rgb(0.95, 0.96, 0.96);
const PENDING_BAND = rgb(1, 0.95, 0.82);
const WHITE = rgb(1, 1, 1);

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
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) chunk = trial;
      else {
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

function line(
  c: Cursor,
  text: string,
  opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number; width?: number }
) {
  const size = opts?.size ?? 10;
  const font = opts?.bold ? c.bold : c.font;
  const color = opts?.color ?? NAVY;
  const x = opts?.x ?? MARGIN;
  const max = opts?.width ?? CONTENT;
  const lines = wrap(font, text, size, max);
  for (const row of lines) {
    ensure(c, size + 4);
    c.page.drawText(row, { x, y: c.y, size, font, color });
    c.y -= size + 3;
  }
  c.y -= opts?.gap ?? 2;
}

function rule(c: Cursor) {
  ensure(c, 10);
  c.page.drawRectangle({ x: MARGIN, y: c.y, width: CONTENT, height: 1, color: RULE });
  c.y -= 10;
}

function heading(c: Cursor, text: string) {
  ensure(c, 28);
  c.page.drawRectangle({ x: MARGIN, y: c.y - 2, width: 4, height: 13, color: GOLD });
  line(c, text, { size: 12, bold: true, gap: 6, x: MARGIN + 10, width: CONTENT - 10 });
}

function resultColor(result: string) {
  if (result === "FAIL") return FAIL;
  if (result === "OK") return OK;
  if (result === NOT_FILLED || result === NOT_WORKED) return SKIP;
  return NAVY;
}

function registerRow(c: Cursor, label: string, value: string, zebra: boolean) {
  const size = 9;
  const labelW = 118;
  const valueW = CONTENT - labelW - 12;
  const valueLines = wrap(c.font, value, size, valueW);
  const height = Math.max(16, valueLines.length * (size + 3) + 8);
  ensure(c, height + 2);
  if (zebra) {
    c.page.drawRectangle({
      x: MARGIN,
      y: c.y - height + 10,
      width: CONTENT,
      height,
      color: BAND,
    });
  }
  c.page.drawText(pdfSafe(label), {
    x: MARGIN + 6,
    y: c.y,
    size,
    font: c.bold,
    color: MUTED,
  });
  let y = c.y;
  for (const row of valueLines) {
    c.page.drawText(row, { x: MARGIN + labelW, y, size, font: c.font, color: NAVY });
    y -= size + 3;
  }
  c.y -= height;
}

function itemRow(c: Cursor, label: string, result: string, zebra: boolean) {
  const size = 8.5;
  const resultW = 78;
  const labelW = CONTENT - resultW - 16;
  const labelLines = wrap(c.font, label, size, labelW);
  const height = Math.max(15, labelLines.length * (size + 2) + 6);
  ensure(c, height + 2);
  const top = c.y - height + 11;
  c.page.drawRectangle({
    x: MARGIN,
    y: top,
    width: CONTENT,
    height,
    color: zebra ? BAND : WHITE,
  });
  let y = c.y;
  for (const row of labelLines) {
    c.page.drawText(row, { x: MARGIN + 6, y, size, font: c.font, color: NAVY });
    y -= size + 2;
  }
  c.page.drawText(pdfSafe(result), {
    x: MARGIN + CONTENT - resultW,
    y: c.y,
    size,
    font: c.bold,
    color: resultColor(result),
  });
  c.y -= height;
}

export async function buildSubmissionPdf(record: Submission, photos: PdfPhoto[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const c: Cursor = { doc, page, font, bold, y: PAGE.height - MARGIN };
  const section = workingSectionLabel(record.meta);
  const photoById = new Map(photos.map((p) => [p.meta.id, p]));

  c.page.drawRectangle({ x: 0, y: PAGE.height - 8, width: PAGE.width, height: 8, color: GOLD });
  line(c, "ADANI CEMENTS", { size: 9, bold: true, color: GOLD, gap: 1 });
  line(c, "Electrical Department · Chittapur", { size: 9, color: MUTED, gap: 4 });
  line(c, "Weekly Electrical Maintenance Register", { size: 16, bold: true, gap: 8 });

  const meta: [string, string][] = [
    ["Working section", section],
    ["Date", record.meta.date],
    ["Submitted", formatSubmitTimestamp(submitInstant(record))],
    ["Technician", record.meta.tech],
    ["Shift", record.meta.shiftLabel],
    ["Supervisor", record.meta.sup?.trim() || "(blank)"],
    ["Completion", `${record.meta.pct}% (${record.meta.done}/${record.meta.total}) · ${record.status}`],
    ["Record", record.id],
  ];
  meta.forEach((pair, i) => registerRow(c, pair[0], pair[1], i % 2 === 0));
  c.y -= 8;

  const selfie = record.selfie ? photoById.get(record.selfie.id) : undefined;
  heading(c, "Technician selfie");
  if (selfie) await drawPhotos(c, [selfie]);
  else if (record.selfie) {
    line(c, "Selfie was taken on submit (photo file not in this PDF copy).", {
      size: 9,
      color: MUTED,
      gap: 8,
    });
  } else {
    line(c, "No selfie on this round (confirmed with PIN).", { size: 9, color: MUTED, gap: 8 });
  }

  heading(c, "Day notes");
  line(c, record.dayNotes?.trim() || "(none)", { size: 10, gap: 4 });
  const dayShots = (record.dayPhotos ?? [])
    .map((p) => photoById.get(p.id))
    .filter((p): p is PdfPhoto => Boolean(p));
  await drawPhotos(c, dayShots);
  c.y -= 4;

  heading(c, "Defects / failures");
  if (record.fails.length > 0) {
    for (const fail of record.fails) {
      line(c, `${fail.equipment} — ${fail.issue} (${fail.type})`, { size: 9, color: FAIL, gap: 2 });
    }
    c.y -= 6;
  } else {
    line(c, "No FAIL checks or defect remarks were recorded.", { size: 10, color: OK, gap: 8 });
  }

  heading(c, "Equipment");
  for (const item of record.snapshot.equip) {
    const st = record.equip[item.id];
    const status = machineStatusLabel(st?.status);
    const pending = !st?.status;
    const stopped = st?.status === "S";
    const params = stopped ? [] : item.runningParams;
    const checks = stopped ? item.stoppedChecks : item.runningChecks;
    const answers = stopped ? st?.stoppedChecks : st?.checks;
    const paramCounts = countParams(item.runningParams, st?.params);
    const checkCounts = countChecks(answers, checks.length);
    const tally = machineTallyLine({
      pending,
      stopped,
      params: paramCounts,
      checks: checkCounts,
    });

    ensure(c, 52);
    c.page.drawRectangle({
      x: MARGIN,
      y: c.y - 6,
      width: CONTENT,
      height: 22,
      color: pending ? PENDING_BAND : NAVY,
    });
    const title = `${item.tag}${item.isHT ? "  HT" : ""}  ${item.name}`;
    c.page.drawText(pdfSafe(title).slice(0, 64), {
      x: MARGIN + 8,
      y: c.y,
      size: 10,
      font: c.bold,
      color: pending ? NAVY : WHITE,
    });
    const statusW = c.bold.widthOfTextAtSize(status, 9);
    c.page.drawText(status, {
      x: MARGIN + CONTENT - statusW - 8,
      y: c.y,
      size: 9,
      font: c.bold,
      color: pending ? rgb(0.55, 0.35, 0.05) : WHITE,
    });
    c.y -= 22;
    line(c, tally, { size: 8, color: pending ? rgb(0.55, 0.35, 0.05) : MUTED, gap: 3 });

    let zebra = false;
    if (params.length) {
      for (const param of params) {
        const shown = paramValueLabel(param, st?.params[param.id]);
        const unit = param.unit ? ` (${param.unit})` : "";
        itemRow(c, `${param.label}${unit}`, shown, zebra);
        zebra = !zebra;
      }
    }
    for (let i = 0; i < checks.length; i += 1) {
      const mark = checkResultLabel(answers?.[String(i)]);
      itemRow(c, checks[i], mark, zebra);
      zebra = !zebra;
    }
    if (st?.remarks?.trim()) {
      line(c, `Remarks: ${st.remarks.trim()}`, { size: 9, color: FAIL, gap: 3 });
    }
    await drawPhotos(c, st?.photos?.map((p) => photoById.get(p.id)).filter(Boolean) as PdfPhoto[]);
    c.y -= 10;
  }

  heading(c, "Common devices");
  for (const group of record.snapshot.common) {
    line(c, group.name, { size: 10, bold: true, color: MUTED, gap: 3 });
    let zebra = false;
    for (const item of group.items) {
      const st = record.common[item.id];
      const mark = checkResultLabel(st?.ok);
      const extra = st?.remarks?.trim() ? ` — ${st.remarks.trim()}` : "";
      itemRow(c, `${item.tag}  ${item.device}  (${item.check})${extra}`, mark, zebra);
      zebra = !zebra;
      await drawPhotos(c, st?.photos?.map((p) => photoById.get(p.id)).filter(Boolean) as PdfPhoto[]);
    }
    c.y -= 6;
  }

  ensure(c, 64);
  rule(c);
  line(c, `Technician signature: ${record.meta.tech}`, { size: 10, gap: 8 });
  line(c, `Supervisor signature: ${record.meta.sup || "____________________"}`, { size: 10, gap: 4 });

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
