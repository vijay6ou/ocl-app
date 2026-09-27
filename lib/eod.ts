import type { EodBlock, EodBlockKind, EodNote, ShiftCode } from "@/lib/types";

export const EOD_BLOCK_OPTIONS: {
  kind: EodBlockKind;
  label: string;
  hint: string;
}[] = [
  { kind: "heading", label: "Heading", hint: "A section title, like Additive or Coal crusher" },
  { kind: "text", label: "Note", hint: "A paragraph for the next shift" },
  { kind: "spoken", label: "Spoken note", hint: "Dictate or type what you would say at handover" },
  { kind: "bullets", label: "Bullets", hint: "Jobs done, leftover work, parts used" },
  { kind: "numbered", label: "Numbered", hint: "Steps, sequence of jobs" },
  { kind: "checklist", label: "Checklist", hint: "Permits, keys, isolations still open" },
  { kind: "photo", label: "Photos", hint: "Rear camera or insert from gallery" },
  { kind: "count", label: "Count", hint: "How many motors meggered, lamps replaced" },
  { kind: "time", label: "Time", hint: "When something happened this shift" },
  { kind: "callout", label: "Attention", hint: "Something the next man must not miss" },
  { kind: "handover", label: "Handover", hint: "Who you are handing over to" },
];

export function newEodBlockId() {
  return crypto.randomUUID();
}

export function emptyEodBlock(kind: EodBlockKind): EodBlock {
  const id = newEodBlockId();
  switch (kind) {
    case "heading":
      return { id, kind, text: "" };
    case "text":
    case "spoken":
      return { id, kind, text: "" };
    case "bullets":
    case "numbered":
      return { id, kind, items: [{ id: newEodBlockId(), text: "" }] };
    case "checklist":
      return { id, kind, items: [{ id: newEodBlockId(), text: "", done: false }] };
    case "photo":
      return { id, kind, photos: [] };
    case "count":
      return { id, kind, label: "", value: "", unit: "" };
    case "time":
      return { id, kind, label: "", at: "" };
    case "callout":
      return { id, kind, tone: "warn", text: "" };
    case "handover":
      return { id, kind, from: "", to: "", text: "" };
  }
}

export function emptyEodNote(args: {
  techId: string;
  tech: string;
  date: string;
  shift: ShiftCode | "";
}): EodNote {
  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    status: "DRAFT",
    date: args.date,
    shift: args.shift,
    techId: args.techId,
    tech: args.tech,
    blocks: [
      emptyEodBlock("heading"),
      emptyEodBlock("text"),
      emptyEodBlock("checklist"),
      emptyEodBlock("photo"),
    ],
  };
}

export function eodHasWork(note: EodNote) {
  return note.blocks.some((b) => {
    if (b.text?.trim()) return true;
    if (b.value?.trim()) return true;
    if (b.at?.trim()) return true;
    if (b.from?.trim() || b.to?.trim()) return true;
    if (b.photos?.length) return true;
    if (b.items?.some((i) => i.text.trim() || i.done)) return true;
    return false;
  });
}
