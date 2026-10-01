import { formatFullRound } from "@/lib/round-text";
import { buildSubmissionPdf } from "@/lib/report-pdf";
import type { Submission } from "@/lib/types";

const record: Submission = {
  id: "TestPending01",
  savedAt: "2026-10-01T11:00:00.000Z",
  submittedAt: "2026-10-01T11:00:00.000Z",
  status: "PENDING",
  meta: {
    date: "2026-10-01",
    shift: "G",
    shiftLabel: "General (09:00–18:00)",
    techId: "u1",
    tech: "Test Tech",
    sup: "",
    form: "Material handling - Coal reclaimers",
    day: "coal-reclaimers",
    dayLabel: "Coal reclaimers",
    plantName: "Adani Cements",
    sectionName: "Material handling",
    areaName: "Coal reclaimers",
    pct: 0,
    done: 0,
    total: 1,
  },
  equip: {},
  common: {},
  fails: [],
  snapshot: {
    label: "Coal reclaimers",
    formLabel: "Material handling - Coal reclaimers",
    equip: [
      {
        id: "m1",
        tag: "RCL-CR1-TRV",
        name: "Travel Drive Motor",
        isHT: false,
        runningParams: [
          { id: "v", label: "Supply Voltage", unit: "V", phases: false, limit: "415 +/- 6%" },
        ],
        runningChecks: ["Motor noise & vibration"],
        stoppedChecks: ["Isolated and locked out"],
      },
    ],
    common: [
      {
        id: "pc",
        name: "Pull Cord Switches",
        color: "",
        icon: "",
        items: [{ id: "pc1", tag: "PC-1", device: "Pull Cord", check: "Reset" }],
      },
    ],
  },
};

async function main() {
  const text = formatFullRound(record);
  const required = [
    "Working section: Material handling - Coal reclaimers",
    "Day notes",
    "(none)",
    "RCL-CR1-TRV",
    "[PENDING]",
    "Supply Voltage (V): —",
    "— · Motor noise & vibration",
    "Submitted:",
  ];
  const missing = required.filter((s) => !text.includes(s));
  if (missing.length) {
    console.error(text);
    throw new Error(`formatFullRound omitted: ${missing.join(" | ")}`);
  }

  const bytes = await buildSubmissionPdf(record, []);
  if (bytes.length < 800) throw new Error("PDF too small");
  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/full-record-pending.pdf", bytes);
  console.log("ok", { textChars: text.length, pdfBytes: bytes.length });
}

void main();
