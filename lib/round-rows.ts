import {
  checkResultLabel,
  machineStatusLabel,
  NOT_FILLED,
  NOT_WORKED,
  paramResultLabel,
  paramValueLabel,
} from "@/lib/fill-status";
import { formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";
import { workingSectionLabel } from "@/lib/working-section";
import type { Submission } from "@/lib/types";

export type RoundExportRow = {
  date: string;
  submitted: string;
  technician: string;
  shift: string;
  plant: string;
  section: string;
  area: string;
  workingSection: string;
  equipmentId: string;
  equipment: string;
  kind: string;
  item: string;
  value: string;
  result: string;
  remarks: string;
  recordId: string;
};

function base(record: Submission): Omit<
  RoundExportRow,
  "equipmentId" | "equipment" | "kind" | "item" | "value" | "result" | "remarks"
> {
  return {
    date: record.meta.date,
    submitted: formatSubmitTimestamp(submitInstant(record)),
    technician: record.meta.tech,
    shift: record.meta.shiftLabel,
    plant: record.meta.plantName || "Adani Cements",
    section: record.meta.sectionName || "",
    area: record.meta.areaName || record.meta.dayLabel || record.meta.day,
    workingSection: workingSectionLabel(record.meta),
    recordId: record.id,
  };
}

export function flattenSubmissionRows(record: Submission): RoundExportRow[] {
  const head = base(record);
  const rows: RoundExportRow[] = [];

  rows.push({
    ...head,
    equipmentId: "",
    equipment: "",
    kind: "Day notes",
    item: "Day notes",
    value: record.dayNotes?.trim() || "(none)",
    result: record.dayNotes?.trim() ? "Written" : NOT_FILLED,
    remarks: record.dayPhotos?.length ? `${record.dayPhotos.length} photo(s)` : "",
  });

  for (const fail of record.fails) {
    rows.push({
      ...head,
      equipmentId: "",
      equipment: fail.equipment,
      kind: "Defect",
      item: fail.type,
      value: fail.issue,
      result: fail.type === "Remark" ? "Remark" : "FAIL",
      remarks: "",
    });
  }

  for (const item of record.snapshot.equip) {
    const st = record.equip[item.id];
    const pending = !st?.status;
    const stopped = st?.status === "S";
    const status = machineStatusLabel(st?.status);
    rows.push({
      ...head,
      equipmentId: item.tag,
      equipment: item.name,
      kind: "Status",
      item: "Machine status",
      value: status,
      result: pending ? NOT_WORKED : status,
      remarks: st?.remarks?.trim() || "",
    });

    if (!stopped) {
      for (const param of item.runningParams) {
        rows.push({
          ...head,
          equipmentId: item.tag,
          equipment: item.name,
          kind: "Parameter",
          item: param.unit ? `${param.label} (${param.unit})` : param.label,
          value: paramValueLabel(param, st?.params[param.id]),
          result: paramResultLabel(param, st?.params[param.id]),
          remarks: param.limit ? `limit ${param.limit}` : "",
        });
      }
    }

    const checks = stopped ? item.stoppedChecks : item.runningChecks;
    const answers = stopped ? st?.stoppedChecks : st?.checks;
    for (let i = 0; i < checks.length; i += 1) {
      const result = checkResultLabel(answers?.[String(i)]);
      rows.push({
        ...head,
        equipmentId: item.tag,
        equipment: item.name,
        kind: stopped ? "Stopped check" : "Running check",
        item: checks[i],
        value: result,
        result,
        remarks: "",
      });
    }

    if (st?.remarks?.trim()) {
      rows.push({
        ...head,
        equipmentId: item.tag,
        equipment: item.name,
        kind: "Remark",
        item: "Equipment remark",
        value: st.remarks.trim(),
        result: "Remark",
        remarks: "",
      });
    }
  }

  for (const group of record.snapshot.common) {
    for (const item of group.items) {
      const st = record.common[item.id];
      const result = checkResultLabel(st?.ok);
      rows.push({
        ...head,
        equipmentId: item.tag,
        equipment: item.device,
        kind: "Common device",
        item: `${group.name} · ${item.check}`,
        value: result,
        result,
        remarks: st?.remarks?.trim() || "",
      });
    }
  }

  return rows;
}

export function flattenRounds(records: Submission[]): RoundExportRow[] {
  return records.flatMap(flattenSubmissionRows);
}
