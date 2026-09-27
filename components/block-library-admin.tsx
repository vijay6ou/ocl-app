"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { blockFamilies, type EquipmentBlock } from "@/lib/equipment-blocks";

const FAMILIES = [
  "Low-tension motors",
  "High-tension motors",
  "Transformers",
  "Plant drives",
  "Other",
];

export function BlockLibraryAdmin({ initial }: { initial: EquipmentBlock[] }) {
  const [blocks, setBlocks] = useState(initial);
  const [editing, setEditing] = useState<EquipmentBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const families = blockFamilies(blocks);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Equipment blocks
          </p>
          <h1 className="font-heading text-3xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">
            Pre-filled types live here. Changing a block updates every working form that already
            uses it. Archived reports stay as they were submitted.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          New block type
        </Button>
      </div>
      {families.map((group) => (
        <section key={group.family}>
          <h2 className="mb-2 font-heading text-lg">{group.family}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {group.blocks.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setEditing(b)}
                className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10"
              >
                <p className="font-heading text-lg font-semibold">{b.title}</p>
                <p className="text-sm text-muted-foreground">{b.summary}</p>
                <p className="mt-2 text-xs">{b.parts.join(" · ")}</p>
              </button>
            ))}
          </div>
        </section>
      ))}
      {editing ? (
        <BlockForm
          block={editing}
          onClose={() => setEditing(null)}
          onSave={async (block) => {
            const data = await api<{ blocks: EquipmentBlock[] }>("/api/blocks", {
              method: "PUT",
              body: JSON.stringify({ block }),
            });
            setBlocks(data.blocks);
            setEditing(null);
            toast.success("Block saved. Working forms now show the new wording.");
          }}
        />
      ) : null}
      {creating ? (
        <BlockForm
          creating
          block={{
            id: "",
            family: "Other",
            title: "",
            summary: "",
            parts: ["Main assembly"],
            isHT: false,
            defaultTag: "NEW",
            defaultName: "",
            params: [{ label: "Current", unit: "A", phases: true, limit: "≤ FLA" }],
            paramIds: ["current"],
            runningChecks: ["Visual condition"],
            stoppedChecks: ["Isolated"],
          }}
          onClose={() => setCreating(false)}
          onSave={async (block) => {
            const data = await api<{ blocks: EquipmentBlock[] }>("/api/blocks", {
              method: "POST",
              body: JSON.stringify(block),
            });
            setBlocks(data.blocks);
            setCreating(false);
            toast.success("New block type is in the library.");
          }}
        />
      ) : null}
    </div>
  );
}

function BlockForm({
  block,
  creating,
  onSave,
  onClose,
}: {
  block: EquipmentBlock;
  creating?: boolean;
  onSave: (block: EquipmentBlock) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(block);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        parts: draft.parts.map((p) => p.trim()).filter(Boolean),
        runningChecks: draft.runningChecks.map((c) => c.trim()).filter(Boolean),
        stoppedChecks: draft.stoppedChecks.map((c) => c.trim()).filter(Boolean),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this block.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <form
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-heading text-lg">{creating ? "New block type" : "Edit block"}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <div>
            <Label htmlFor="blk-title">Name</Label>
            <Input
              id="blk-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="blk-family">Family</Label>
            <select
              id="blk-family"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={draft.family}
              onChange={(e) => setDraft({ ...draft, family: e.target.value })}
            >
              {FAMILIES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="blk-sum">Summary</Label>
            <Input
              id="blk-sum"
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="blk-parts">Internal parts (one per line)</Label>
            <Textarea
              id="blk-parts"
              value={draft.parts.join("\n")}
              onChange={(e) => setDraft({ ...draft, parts: e.target.value.split("\n") })}
            />
          </div>
          <div>
            <Label htmlFor="blk-run">Running checks (one per line)</Label>
            <Textarea
              id="blk-run"
              value={draft.runningChecks.join("\n")}
              onChange={(e) => setDraft({ ...draft, runningChecks: e.target.value.split("\n") })}
            />
          </div>
        </div>
        <div className="border-t border-border p-3">
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save block"}
          </Button>
        </div>
      </form>
    </div>
  );
}