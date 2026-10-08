import type { CheckResult, EquipStatus, ParamValue, RunningParam } from "@/lib/types";

export const NOT_FILLED = "Not filled";
export const NOT_WORKED = "Not worked";

export function machineStatusLabel(status: EquipStatus | undefined) {
  if (status === "R") return "RUNNING";
  if (status === "S") return "STOPPED";
  return "PENDING";
}

export function checkResultLabel(value: CheckResult | undefined) {
  if (value === "ok") return "OK";
  if (value === "fail") return "FAIL";
  return NOT_WORKED;
}

function phasePart(raw: string | undefined) {
  const text = (raw ?? "").trim();
  return text || NOT_FILLED;
}

export function paramFilled(param: RunningParam, value: ParamValue | undefined) {
  if (!value) return false;
  if (param.phases) {
    return Boolean((value.r ?? "").trim() || (value.y ?? "").trim() || (value.b ?? "").trim());
  }
  return Boolean((value.v ?? "").trim());
}

export function paramValueLabel(param: RunningParam, value: ParamValue | undefined) {
  if (!paramFilled(param, value)) return NOT_FILLED;
  if (param.phases) {
    return `R ${phasePart(value?.r)} / Y ${phasePart(value?.y)} / B ${phasePart(value?.b)}`;
  }
  return (value?.v ?? "").trim() || NOT_FILLED;
}

export function paramResultLabel(param: RunningParam, value: ParamValue | undefined) {
  return paramFilled(param, value) ? "Filled" : NOT_FILLED;
}

export function countChecks(answers: Record<string, CheckResult> | undefined, total: number) {
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (let i = 0; i < total; i += 1) {
    const ans = answers?.[String(i)];
    if (ans === "ok") ok += 1;
    else if (ans === "fail") fail += 1;
    else skipped += 1;
  }
  return { ok, fail, skipped, total };
}

export function countParams(params: RunningParam[], values: Record<string, ParamValue> | undefined) {
  let filled = 0;
  for (const param of params) {
    if (paramFilled(param, values?.[param.id])) filled += 1;
  }
  return { filled, skipped: params.length - filled, total: params.length };
}

export function machineTallyLine(opts: {
  pending: boolean;
  stopped: boolean;
  params: { filled: number; skipped: number; total: number };
  checks: { ok: number; fail: number; skipped: number; total: number };
}) {
  if (opts.pending) return "PENDING — not worked this round";
  const bits: string[] = [];
  if (opts.stopped) bits.push("STOPPED — running readings not taken");
  if (!opts.stopped && opts.params.total) {
    bits.push(
      `${opts.params.filled} of ${opts.params.total} reading${opts.params.total === 1 ? "" : "s"} filled`
    );
    if (opts.params.skipped) bits.push(`${opts.params.skipped} not filled`);
  }
  if (opts.checks.total) {
    const parts: string[] = [];
    if (opts.checks.ok) parts.push(`${opts.checks.ok} OK`);
    if (opts.checks.fail) parts.push(`${opts.checks.fail} FAIL`);
    if (opts.checks.skipped) parts.push(`${opts.checks.skipped} not worked`);
    bits.push(`Checks: ${parts.join(", ") || `${opts.checks.total} not worked`}`);
  }
  return bits.join(" · ");
}
