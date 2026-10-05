import { formatFullRound, formatRoundSummary } from "@/lib/round-text";
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
  equip: {
    m1: {
      status: "R",
      params: { v: { v: "415" } },
      checks: { "0": "fail" },
      stoppedChecks: {},
      remarks: "Greasing pending at coupling",
      photos: [],
    },
  },
  common: {},
  fails: [
    {
      equipment: "RCL-CR1-TRV Travel Drive Motor",
      issue: "Motor noise & vibration",
      type: "Running Check",
    },
    {
      equipment: "RCL-CR1-TRV Travel Drive Motor",
      issue: "Greasing pending at coupling",
      type: "Remark",
    },
  ],
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
  dayNotes: "CPP circuit greasing done",
};

async function main() {
  const text = formatFullRound(record);
  const required = [
    "Working section: Material handling - Coal reclaimers",
    "Day notes",
    "CPP circuit greasing done",
    "RCL-CR1-TRV",
    "[RUNNING]",
    "Supply Voltage (V): 415",
    "FAIL · Motor noise & vibration",
    "Submitted:",
  ];
  const missing = required.filter((s) => !text.includes(s));
  if (missing.length) {
    console.error(text);
    throw new Error(`formatFullRound omitted: ${missing.join(" | ")}`);
  }

  const summary = formatRoundSummary(record);
  const summaryNeed = [
    "Written comments",
    "CPP circuit greasing done",
    "Greasing pending at coupling",
    "Fault comments",
    "Motor noise & vibration",
  ];
  const summaryMissing = summaryNeed.filter((s) => !summary.includes(s));
  if (summaryMissing.length) {
    console.error(summary);
    throw new Error(`formatRoundSummary omitted: ${summaryMissing.join(" | ")}`);
  }
  if (summary.includes("Supply Voltage")) {
    throw new Error("Telegram summary must not repeat full-form readings");
  }
  const remarkHits = summary.split("Greasing pending at coupling").length - 1;
  if (remarkHits !== 1) {
    throw new Error(`Written remark should appear once, found ${remarkHits}`);
  }

  const bytes = await buildSubmissionPdf(record, []);
  if (bytes.length < 800) throw new Error("PDF too small");
  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/full-record-pending.pdf", bytes);
  console.log("ok", { textChars: text.length, summaryChars: summary.length, pdfBytes: bytes.length });
}

void main();
