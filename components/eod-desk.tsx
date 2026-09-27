"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckSquare,
  Clock3,
  Hash,
  Heading2,
  List,
  ListOrdered,
  Mic,
  Plus,
  Trash2,
  Type,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PhotoCapture } from "@/components/photo-capture";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { emptyEodBlock, emptyEodNote, EOD_BLOCK_OPTIONS, eodHasWork, newEodBlockId } from "@/lib/eod";
import { pathForArea, sectionsOfPlant } from "@/lib/hierarchy";
import type { PhotoPlace } from "@/lib/media-path";
import {
  SHIFT_OPTIONS,
  type Catalogue,
  type EodBlock,
  type EodBlockKind,
  type EodNote,
  type ShiftCode,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

const ICONS: Record<EodBlockKind, typeof Type> = {
  heading: Heading2,
  text: Type,
  spoken: Mic,
  bullets: List,
  numbered: ListOrdered,
  checklist: CheckSquare,
  photo: Camera,
  count: Hash,
  time: Clock3,
  callout: AlertTriangle,
  handover: UserRound,
};

export function EodDesk() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<EodNote[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EodNote | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [n, c] = await Promise.all([
        api<{ notes: EodNote[] }>("/api/eod"),
        api<{ catalogue: Catalogue }>("/api/catalogue"),
      ]);
      setNotes(n.notes);
      setCatalogue(c.catalogue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load handovers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Opening today’s handover book…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!user) return null;

  if (editing) {
    return (
      <EodComposer
        note={editing}
        catalogue={catalogue}
        onClose={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  const mine = notes.filter((n) => n.techId === user.id);
  const others = notes.filter((n) => n.techId !== user.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            End of day
          </p>
          <h1 className="font-heading text-3xl font-semibold">Handover</h1>
          <p className="text-sm text-muted-foreground">
            Write what the next man needs: leftover jobs, open permits, counts, photos of the
            board or a defect. Mix notes, bullets, checklists, rear camera, and gallery in one
            page.
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            setEditing(emptyEodNote({ techId: user.id, tech: user.name, date: todayISO(), shift: "G" }))
          }
        >
          <Plus />
          New handover
        </Button>
      </div>

      {mine.length === 0 && others.length === 0 ? (
        <EmptyState
          title="No handover yet today"
          message="Open New handover at the end of the shift. The next technician will read it before they walk out."
        />
      ) : null}

      {mine.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg">Yours</h2>
          {mine.map((note) => (
            <NoteRow key={note.id} note={note} onOpen={() => setEditing(note)} />
          ))}
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg">On this plant</h2>
          {others.map((note) => (
            <NoteRow key={note.id} note={note} onOpen={() => setEditing(note)} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function NoteRow({ note, onOpen }: { note: EodNote; onOpen: () => void }) {
  const shift = SHIFT_OPTIONS.find((s) => s.code === note.shift)?.label ?? "Shift not set";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1 rounded-2xl border bg-card p-4 text-left shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {note.areaName || note.sectionName || note.plantName || "Plant handover"}
        </span>
        <Badge variant={note.status === "SUBMITTED" ? "secondary" : "outline"}>
          {note.status === "SUBMITTED" ? "Handed over" : "Draft"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {note.date} · {shift} · {note.tech} · {note.blocks.length} items
      </p>
    </button>
  );
}

function EodComposer({
  note,
  catalogue,
  onClose,
}: {
  note: EodNote;
  catalogue: Catalogue | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState(note);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const readOnly = draft.status === "SUBMITTED" && user?.role !== "admin";

  const place: PhotoPlace | undefined = useMemo(() => {
    if (!catalogue || !draft.areaId) {
      return {
        plantId: draft.plantId,
        plantName: draft.plantName,
        sectionId: draft.sectionId,
        sectionName: draft.sectionName,
        areaId: draft.areaId,
        areaName: draft.areaName,
        source: "eod",
        date: draft.date,
      };
    }
    const path = pathForArea(catalogue, draft.areaId);
    return {
      plantId: path.plant?.id,
      plantName: path.plant?.name,
      sectionId: path.section?.id,
      sectionName: path.section?.name,
      areaId: path.areaId,
      areaName: path.area?.label,
      source: "eod",
      date: draft.date,
    };
  }, [catalogue, draft.areaId, draft.areaName, draft.date, draft.plantId, draft.plantName, draft.sectionId, draft.sectionName]);

  function patch(partial: Partial<EodNote>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function setBlock(id: string, next: EodBlock) {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? next : b)),
    }));
  }

  function addBlock(kind: EodBlockKind) {
    setDraft((prev) => ({ ...prev, blocks: [...prev.blocks, emptyEodBlock(kind)] }));
    setAddOpen(false);
  }

  function removeBlock(id: string) {
    setDraft((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  }

  function setArea(areaId: string) {
    if (!catalogue || !areaId) {
      patch({ areaId: "", areaName: "", sectionId: "", sectionName: "", plantId: "", plantName: "" });
      return;
    }
    const path = pathForArea(catalogue, areaId);
    patch({
      areaId: path.areaId,
      areaName: path.area?.label,
      sectionId: path.section?.id,
      sectionName: path.section?.name,
      plantId: path.plant?.id,
      plantName: path.plant?.name,
    });
  }

  async function save(submit: boolean) {
    if (!draft.date) {
      toast.error("Pick the date of this shift.");
      return;
    }
    setBusy(true);
    try {
      const saved = await api<{ note: EodNote }>("/api/eod", {
        method: "POST",
        body: JSON.stringify({ note: { ...draft, status: "DRAFT" } }),
      });
      if (submit) {
        const done = await api<{ note: EodNote }>("/api/eod", {
          method: "PUT",
          body: JSON.stringify({ note: saved.note, submit: true }),
        });
        setDraft(done.note);
        toast.success("Handover is on the plant for the next shift.");
        onClose();
        return;
      }
      setDraft(saved.note);
      toast.success("Draft saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this handover.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (draft.status === "SUBMITTED") return;
    setBusy(true);
    try {
      await api(`/api/eod/${draft.id}`, { method: "DELETE" });
      toast.success("Draft discarded.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete this draft.");
    } finally {
      setBusy(false);
    }
  }

  const areas =
    catalogue?.plants.flatMap((plant) =>
      sectionsOfPlant(catalogue, plant.id).flatMap((section) =>
        section.areaIds.map((id) => ({
          id,
          label: `${plant.name} · ${section.name} · ${catalogue.days[id]?.label ?? id}`,
        }))
      )
    ) ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 pb-28 md:py-6">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          ← Handovers
        </Button>
        {readOnly ? <Badge>Handed over</Badge> : null}
      </div>
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          {readOnly ? "Handover" : "Write the handover"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {user?.name} · mix whatever the next man needs. Photos file under the area you pick.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="eod-date">Date</Label>
          <Input
            id="eod-date"
            type="date"
            value={draft.date}
            disabled={readOnly}
            onChange={(e) => patch({ date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="eod-shift">Shift</Label>
          <select
            id="eod-shift"
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={draft.shift}
            disabled={readOnly}
            onChange={(e) => patch({ shift: e.target.value as ShiftCode | "" })}
          >
            <option value="">Pick shift</option>
            {SHIFT_OPTIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="eod-area">Area this handover is about</Label>
        <select
          id="eod-area"
          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
          value={draft.areaId ?? ""}
          disabled={readOnly}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="">Whole plant / not tied to one area</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {draft.blocks.map((block) => (
          <EodBlockCard
            key={block.id}
            block={block}
            place={place}
            date={draft.date}
            readOnly={readOnly}
            onChange={(next) => setBlock(block.id, next)}
            onRemove={() => removeBlock(block.id)}
          />
        ))}
      </div>

      {!readOnly ? (
        <div className="rounded-2xl border bg-card p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium"
            onClick={() => setAddOpen((v) => !v)}
          >
            Add a block
            <Plus className={cn("size-4 transition", addOpen && "rotate-45")} />
          </button>
          {addOpen ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EOD_BLOCK_OPTIONS.map((opt) => {
                const Icon = ICONS[opt.kind];
                return (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => addBlock(opt.kind)}
                    className="rounded-xl border bg-background p-3 text-left"
                  >
                    <Icon className="mb-1 size-4" />
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{opt.hint}</p>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(13,33,55,0.08)] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>
              {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !eodHasWork(draft)}
              onClick={() => void save(true)}
            >
              Hand over to next shift
            </Button>
            <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void remove()}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EodBlockCard({
  block,
  place,
  date,
  readOnly,
  onChange,
  onRemove,
}: {
  block: EodBlock;
  place?: PhotoPlace;
  date: string;
  readOnly: boolean;
  onChange: (next: EodBlock) => void;
  onRemove: () => void;
}) {
  const Icon = ICONS[block.kind];
  const title = EOD_BLOCK_OPTIONS.find((o) => o.kind === block.kind)?.label ?? block.kind;

  return (
    <article className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-4" />
          {title}
        </p>
        {!readOnly ? (
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Remove block">
            <Trash2 />
          </Button>
        ) : null}
      </div>
      {block.kind === "heading" || block.kind === "text" || block.kind === "spoken" ? (
        <div className="space-y-2">
          {block.kind === "spoken" && !readOnly ? (
            <DictationButton
              onTranscript={(text) =>
                onChange({ ...block, text: [block.text, text].filter(Boolean).join(" ") })
              }
            />
          ) : null}
          {block.kind === "heading" ? (
            <Input
              value={block.text ?? ""}
              disabled={readOnly}
              placeholder="Additive / leftover jobs"
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          ) : (
            <Textarea
              value={block.text ?? ""}
              disabled={readOnly}
              placeholder={
                block.kind === "spoken"
                  ? "What you would say standing at the board…"
                  : "Write it the way you would tell the next shift."
              }
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          )}
        </div>
      ) : null}
      {block.kind === "bullets" || block.kind === "numbered" || block.kind === "checklist" ? (
        <ListEditor block={block} readOnly={readOnly} onChange={onChange} />
      ) : null}
      {block.kind === "photo" ? (
        readOnly ? (
          <div className="flex flex-wrap gap-2">
            {(block.photos ?? []).map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={`/api/photos/${photo.id}`}
                alt=""
                className="size-20 rounded-md object-cover"
              />
            ))}
            {(block.photos ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos on this handover.</p>
            ) : null}
          </div>
        ) : (
          <PhotoCapture
            photos={block.photos ?? []}
            kind="eod"
            facing="environment"
            gallery
            label="Rear camera"
            hint="Rear camera or insert from this phone’s gallery."
            place={place}
            source="eod"
            date={date}
            onChange={(photos) => onChange({ ...block, photos })}
          />
        )
      ) : null}
      {block.kind === "count" ? (
        <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
          <Input
            value={block.label ?? ""}
            disabled={readOnly}
            placeholder="Motors meggered"
            onChange={(e) => onChange({ ...block, label: e.target.value })}
          />
          <Input
            value={block.value ?? ""}
            disabled={readOnly}
            inputMode="decimal"
            placeholder="12"
            onChange={(e) => onChange({ ...block, value: e.target.value })}
          />
          <Input
            value={block.unit ?? ""}
            disabled={readOnly}
            placeholder="nos"
            onChange={(e) => onChange({ ...block, unit: e.target.value })}
          />
        </div>
      ) : null}
      {block.kind === "time" ? (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={block.label ?? ""}
            disabled={readOnly}
            placeholder="Permit closed"
            onChange={(e) => onChange({ ...block, label: e.target.value })}
          />
          <Input
            type="time"
            value={block.at ?? ""}
            disabled={readOnly}
            onChange={(e) => onChange({ ...block, at: e.target.value })}
          />
        </div>
      ) : null}
      {block.kind === "callout" ? (
        <div className="space-y-2">
          <select
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={block.tone ?? "warn"}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ ...block, tone: e.target.value as "info" | "warn" | "urgent" })
            }
          >
            <option value="info">For information</option>
            <option value="warn">Watch this</option>
            <option value="urgent">Do not start until this is clear</option>
          </select>
          <Textarea
            value={block.text ?? ""}
            disabled={readOnly}
            placeholder="HT crusher space heater off. Next shift must confirm before start."
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </div>
      ) : null}
      {block.kind === "handover" ? (
        <div className="space-y-2">
          <Input
            value={block.from ?? ""}
            disabled={readOnly}
            placeholder="Handing over from"
            onChange={(e) => onChange({ ...block, from: e.target.value })}
          />
          <Input
            value={block.to ?? ""}
            disabled={readOnly}
            placeholder="Handing over to"
            onChange={(e) => onChange({ ...block, to: e.target.value })}
          />
          <Textarea
            value={block.text ?? ""}
            disabled={readOnly}
            placeholder="Keys, permits, leftover isolation…"
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </div>
      ) : null}
    </article>
  );
}

function ListEditor({
  block,
  readOnly,
  onChange,
}: {
  block: EodBlock;
  readOnly: boolean;
  onChange: (next: EodBlock) => void;
}) {
  const items = block.items ?? [];
  function setItem(id: string, patch: { text?: string; done?: boolean }) {
    onChange({
      ...block,
      items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  }
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2">
          {block.kind === "checklist" ? (
            <input
              type="checkbox"
              checked={Boolean(item.done)}
              disabled={readOnly}
              onChange={(e) => setItem(item.id, { done: e.target.checked })}
            />
          ) : (
            <span className="w-4 shrink-0 text-xs text-muted-foreground">
              {block.kind === "numbered" ? `${index + 1}.` : "•"}
            </span>
          )}
          <Input
            value={item.text}
            disabled={readOnly}
            placeholder={block.kind === "checklist" ? "Permit / isolation / keys" : "Job"}
            onChange={(e) => setItem(item.id, { text: e.target.value })}
          />
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange({ ...block, items: items.filter((i) => i.id !== item.id) })}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      ))}
      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...block,
              items: [...items, { id: newEodBlockId(), text: "", done: false }],
            })
          }
        >
          Add line
        </Button>
      ) : null}
    </div>
  );
}

function DictationButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);

  function start() {
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeech;
      webkitSpeechRecognition?: new () => BrowserSpeech;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("This phone cannot dictate. Type the handover instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (ev: { results: { 0: { 0: { transcript: string } } } }) => {
      const text = ev.results?.[0]?.[0]?.transcript ?? "";
      if (text) onTranscript(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={start} disabled={listening}>
      <Mic />
      {listening ? "Listening…" : "Dictate"}
    </Button>
  );
}

type BrowserSpeech = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
