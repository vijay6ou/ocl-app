import type {
  CheckResult,
  CommonGroup,
  CommonState,
  DayCatalogue,
  EquipState,
  Equipment,
  FailItem,
} from "./types";

function answered(v: CheckResult) {
  return v === "ok" || v === "fail";
}

export function emptyEquipState(): EquipState {
  return {
    status: null,
    params: {},
    checks: {},
    stoppedChecks: {},
    remarks: "",
    photos: [],
  };
}

export function emptyCommonState(): CommonState {
  return { ok: null, remarks: "", photos: [] };
}

export function progressForDay(
  day: DayCatalogue,
  equip: Record<string, EquipState>,
  common: Record<string, CommonState>
) {
  let done = 0;
  let total = 0;

  for (const e of day.equip) {
    total += 1;
    const st = equip[e.id] ?? emptyEquipState();
    if (st.status === "R" || st.status === "S") done += 1;

    const checks = st.status === "S" ? e.stoppedChecks : e.runningChecks;
    const answers = st.status === "S" ? st.stoppedChecks : st.checks;
    for (let i = 0; i < checks.length; i++) {
      total += 1;
      if (answered(answers[String(i)] ?? null)) done += 1;
    }
  }

  for (const g of day.common) {
    for (const item of g.items) {
      total += 1;
      const st = common[item.id] ?? emptyCommonState();
      if (answered(st.ok)) done += 1;
    }
  }

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

export function deriveFails(
  day: DayCatalogue,
  equip: Record<string, EquipState>,
  common: Record<string, CommonState>
): FailItem[] {
  const fails: FailItem[] = [];

  for (const e of day.equip) {
    const st = equip[e.id] ?? emptyEquipState();
    const label = `${e.tag} ${e.name}`;
    if (st.status === "R") {
      e.runningChecks.forEach((check, i) => {
        if (st.checks[String(i)] === "fail") {
          fails.push({ equipment: label, issue: check, type: "Running Check" });
        }
      });
    }
    if (st.status === "S") {
      e.stoppedChecks.forEach((check, i) => {
        if (st.stoppedChecks[String(i)] === "fail") {
          fails.push({ equipment: label, issue: check, type: "Stopped Check" });
        }
      });
    }
    if (st.remarks.trim()) {
      fails.push({
        equipment: label,
        issue: st.remarks.trim(),
        type: "Remark",
      });
    }
  }

  for (const g of day.common) {
    for (const item of g.items) {
      const st = common[item.id] ?? emptyCommonState();
      if (st.ok === "fail") {
        fails.push({
          equipment: `${item.tag} ${item.device}`,
          issue: st.remarks.trim() || item.check,
          type: "Common Device",
        });
      }
    }
  }

  return fails;
}

export function isComplete(
  day: DayCatalogue,
  equip: Record<string, EquipState>,
  common: Record<string, CommonState>
) {
  const { done, total } = progressForDay(day, equip, common);
  return total > 0 && done === total;
}

export function sanitizeDecimal(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

export function lookupEquipment(list: Equipment[], id: string) {
  return list.find((e) => e.id === id);
}

export function lookupCommon(groups: CommonGroup[], id: string) {
  for (const g of groups) {
    const item = g.items.find((i) => i.id === id);
    if (item) return { group: g, item };
  }
  return null;
}
