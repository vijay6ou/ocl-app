import ExcelJS from "exceljs";
import { NOT_FILLED, NOT_WORKED } from "@/lib/fill-status";
import { flattenRounds, type RoundExportRow } from "@/lib/round-rows";
import type { Submission } from "@/lib/types";

const COLUMNS: { header: string; key: keyof RoundExportRow; width: number }[] = [
  { header: "Date", key: "date", width: 12 },
  { header: "Submitted", key: "submitted", width: 28 },
  { header: "Technician", key: "technician", width: 18 },
  { header: "Shift", key: "shift", width: 22 },
  { header: "Plant", key: "plant", width: 16 },
  { header: "Section", key: "section", width: 20 },
  { header: "Area", key: "area", width: 18 },
  { header: "Equipment ID", key: "equipmentId", width: 16 },
  { header: "Equipment", key: "equipment", width: 28 },
  { header: "Kind", key: "kind", width: 16 },
  { header: "Item", key: "item", width: 36 },
  { header: "Value", key: "value", width: 28 },
  { header: "OK / FAIL", key: "result", width: 14 },
  { header: "Remarks", key: "remarks", width: 28 },
  { header: "Record", key: "recordId", width: 16 },
];

function sheetName(raw: string, used: Set<string>) {
  let name = raw.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Area";
  if (name.length > 31) name = name.slice(0, 31).trim();
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = `${name.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function paintResult(cell: ExcelJS.Cell, result: string) {
  if (result === "FAIL") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } };
    cell.font = { color: { argb: "FF9B1C1C" }, bold: true };
  } else if (result === "OK") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1E7DD" } };
  } else if (result === NOT_FILLED || result === NOT_WORKED) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    cell.font = { color: { argb: "FF5C6570" }, italic: true };
  } else if (result === "PENDING") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
  }
}

function addSheet(wb: ExcelJS.Workbook, name: string, rows: RoundExportRow[]) {
  const sheet = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1, xSplit: 0 }],
  });
  sheet.columns = COLUMNS.map((col) => ({ header: col.header, key: col.key, width: col.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4332" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 22;
  for (const row of rows) {
    const added = sheet.addRow(row);
    added.alignment = { vertical: "middle", wrapText: true };
    const resultCell = added.getCell("result");
    paintResult(resultCell, row.result);
    const valueCell = added.getCell("value");
    if (row.value === NOT_FILLED || row.value === NOT_WORKED) {
      valueCell.font = { color: { argb: "FF5C6570" }, italic: true };
    }
  }
  if (rows.length) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: COLUMNS.length },
    };
  }
  return sheet;
}

export function excelFilename(from: string, to: string) {
  return `Adani-Cements-rounds-${from}-to-${to}.xlsx`;
}

export async function buildRoundsWorkbook(records: Submission[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Adani Cements electrical PM";
  wb.created = new Date();
  const all = flattenRounds(records);
  addSheet(wb, "Summary", all);

  const grouped = new Map<string, RoundExportRow[]>();
  for (const row of all) {
    const combined = [row.section, row.area].filter(Boolean).join(" - ");
    const key =
      (combined.length <= 31 ? combined : row.area) ||
      row.workingSection ||
      "Area";
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const used = new Set<string>(["summary"]);
  for (const [label, rows] of grouped) {
    addSheet(wb, sheetName(label, used), rows);
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
