import { workingSectionLabel } from "@/lib/working-section";
import { formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";
import type { Submission } from "@/lib/types";

function yn(value: string | null | undefined) {
  if (value === "ok") return "OK";
  if (value === "fail") return "FAIL";
  return "—";
}

function statusLabel(status: "R" | "S" | null | undefined) {
  if (status === "R") return "RUNNING";
  if (status === "S") return "STOPPED";
  return "PENDING";
}

export function roundHeader(record: Submission) {
  const section = workingSectionLabel(record.meta);
  return [
    "ADANI CEMENTS",
    "Electrical Department · Chittapur",
    "Weekly Electrical Maintenance Report",
    "",
    `Working section: ${section}`,
    `Date: ${record.meta.date}`,
    `Submitted: ${formatSubmitTimestamp(submitInstant(record))}`,
    `Shift: ${record.meta.shiftLabel}`,
    `Technician: ${record.meta.tech}`,
    `Supervisor: ${record.meta.sup || "(blank)"}`,
    `Completion: ${record.meta.pct}% (${record.meta.done}/${record.meta.total}) · ${record.status}`,
    `Record: ${record.id}`,
  ].join("\n");
}

/** Full round in the same order as the in-app record / print view. */
export function formatFullRound(record: Submission): string {
  const lines: string[] = [roundHeader(record), ""];

  if (record.fails.length > 0) {
    lines.push("Defects / failures");
    for (const fail of record.fails) {
      lines.push(`• ${fail.equipment} — ${fail.issue} (${fail.type})`);
    }
  } else {
    lines.push("No FAIL checks or defect remarks were recorded.");
  }
  lines.push("");

  lines.push("Equipment");
  lines.push("─────────");
  for (const item of record.snapshot.equip) {
    const st = record.equip[item.id];
    lines.push("");
    lines.push(
      `${item.tag}${item.isHT ? "  HT" : ""}  ${item.name}  [${statusLabel(st?.status)}]`
    );
    if (st?.status === "R" && item.runningParams.length > 0) {
      for (const param of item.runningParams) {
        const v = st.params[param.id] ?? {};
        const shown = param.phases
          ? `R ${v.r || "—"} / Y ${v.y || "—"} / B ${v.b || "—"}`
          : v.v || "—";
        const unit = param.unit ? ` (${param.unit})` : "";
        const limit = param.limit ? `  limit ${param.limit}` : "";
        lines.push(`  ${param.label}${unit}: ${shown}${limit}`);
      }
    }
    const checks = st?.status === "S" ? item.stoppedChecks : item.runningChecks;
    const answers = st?.status === "S" ? st.stoppedChecks : st?.checks;
    if (st?.status && checks.length > 0) {
      for (let i = 0; i < checks.length; i += 1) {
        lines.push(`  ${yn(answers?.[String(i)])} · ${checks[i]}`);
      }
    }
    if (st?.remarks) lines.push(`  Remarks: ${st.remarks}`);
    const photoCount = st?.photos?.length ?? 0;
    if (photoCount) lines.push(`  Photos: ${photoCount}`);
  }

  lines.push("");
  lines.push("Common devices");
  lines.push("──────────────");
  for (const group of record.snapshot.common) {
    lines.push("");
    lines.push(group.name);
    for (const item of group.items) {
      const st = record.common[item.id];
      const extra = st?.remarks ? ` · ${st.remarks}` : "";
      const photos = st?.photos?.length ? ` · ${st.photos.length} photo(s)` : "";
      lines.push(`  ${item.tag}  ${item.device}  ${yn(st?.ok)}${extra}${photos}`);
      lines.push(`    ${item.check}`);
    }
  }

  lines.push("");
  lines.push(
    record.selfie
      ? "Technician selfie: attached"
      : "Technician selfie: missing"
  );
  lines.push(`Technician signature: ${record.meta.tech}`);
  lines.push(`Supervisor signature: ${record.meta.sup || "____________________"}`);
  return lines.join("\n");
}

/** Faults and wrong items only — FAIL checks, defect remarks, pending machines. */
export function formatFaultsOnly(record: Submission): string {
  const lines: string[] = [
    "Adani Cements weekly electrical PM — faults / wrong items",
    `Date: ${record.meta.date}`,
    `Working section: ${workingSectionLabel(record.meta)}`,
    `Shift: ${record.meta.shiftLabel}`,
    `Technician: ${record.meta.tech}`,
    `Record: ${record.id}`,
    "",
  ];

  const pending = record.snapshot.equip.filter((item) => {
    const st = record.equip[item.id];
    return !st?.status;
  });

  if (record.fails.length === 0 && pending.length === 0) {
    lines.push("No faults or wrong items.");
    return lines.join("\n");
  }

  if (record.fails.length > 0) {
    lines.push("FAIL / defect items");
    for (const fail of record.fails) {
      lines.push(`• ${fail.equipment}: ${fail.issue} (${fail.type})`);
    }
    lines.push("");
  }

  if (pending.length > 0) {
    lines.push("Equipment still PENDING (no RUNNING/STOPPED)");
    for (const item of pending) {
      lines.push(`• ${item.tag} ${item.name}`);
    }
  }

  return lines.join("\n").trim();
}

export function discordThreadName(record: Submission) {
  return `${record.meta.date} · Adani Cements electrical PM`.slice(0, 100);
}
