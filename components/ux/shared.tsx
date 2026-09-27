"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BLOCK_FAMILIES, blockById, usesOfBlock, type UxBlock, type UxState } from "@/lib/ux-mock";
import { useUx } from "@/components/ux/store";

export function NameAdd({
  placeholder,
  label,
  onAdd,
}: {
  placeholder: string;
  label: string;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(name.trim());
        setName("");
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      <Button type="submit" size="sm">
        {label}
      </Button>
    </form>
  );
}

export function AreaRound({ areaId }: { areaId: string }) {
  const { state, dispatch } = useUx();
  const area = state.areas.find((a) => a.id === areaId);
  const placed = state.placed.filter((p) => p.areaId === areaId);
  const [picker, setPicker] = useState(false);
  if (!area) return <p className="text-sm text-muted-foreground">Area not found.</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Round form
        </p>
        <h2 className="font-heading text-2xl font-semibold">{area.name}</h2>
        <p className="text-sm text-muted-foreground">
          Equipment comes from the block library. Edit a block and every form that uses it
          updates.
        </p>
      </div>
      {placed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          No equipment on this area yet. Pull a block from the library.
        </p>
      ) : null}
      {placed.map((item) => {
        const block = blockById(state, item.blockId);
        if (!block) {
          return (
            <article key={item.id} className="rounded-xl bg-card p-4 ring-1 ring-destructive/30">
              Missing block {item.blockId}
            </article>
          );
        }
        return (
          <article key={item.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-heading text-lg font-semibold">
                  {item.tag} · {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Follows library block · {block.title}
                </p>
              </div>
              <span className="chip">{block.family}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Parts: {block.parts.join(" · ")}
            </p>
            <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              {block.readings.map((r) => (
                <li key={r.label} className="rounded-lg bg-muted/60 px-2 py-1">
                  {r.label}{" "}
                  <span className="text-muted-foreground">
                    ({r.unit}) {r.limit}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Running checks
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {block.runningChecks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </article>
        );
      })}
      <Button type="button" variant="outline" onClick={() => setPicker(true)}>
        Add from block library
      </Button>
      {picker ? (
        <BlockPicker
          state={state}
          onPick={(blockId) => {
            dispatch({ type: "place-block", areaId, blockId });
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      ) : null}
    </div>
  );
}

function BlockPicker({
  state,
  onPick,
  onClose,
}: {
  state: UxState;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const families = [...new Set(state.blocks.map((b) => b.family))];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-background sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-heading text-lg">Block library</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto p-4">
          {families.map((family) => (
            <section key={family} className="mb-4">
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {family}
              </h4>
              <div className="grid gap-2">
                {state.blocks
                  .filter((b) => b.family === family)
                  .map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onPick(b.id)}
                      className="rounded-xl border border-border bg-card p-3 text-left hover:border-primary"
                    >
                      <p className="font-medium">{b.title}</p>
                      <p className="text-xs text-muted-foreground">{b.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.parts.length} parts · {b.readings.length} readings
                      </p>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BlockLibrary({ canEdit }: { canEdit: boolean }) {
  const { state, dispatch } = useUx();
  const [editing, setEditing] = useState<UxBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const families = [...new Set(state.blocks.map((b) => b.family))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Equipment blocks
          </p>
          <h2 className="font-heading text-2xl font-semibold">Library</h2>
          <p className="text-sm text-muted-foreground">
            Pre-filled types live here. A new type can be added later. Changing a block updates
            every form that already uses it.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={() => setCreating(true)}>
            New block type
          </Button>
        ) : null}
      </div>
      {families.map((family) => (
        <section key={family}>
          <h3 className="mb-2 font-heading text-lg">{family}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {state.blocks
              .filter((b) => b.family === family)
              .map((b) => {
                const used = usesOfBlock(state, b.id).length;
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => canEdit && setEditing(b)}
                    className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 disabled:opacity-80"
                  >
                    <p className="font-heading text-lg font-semibold">{b.title}</p>
                    <p className="text-sm text-muted-foreground">{b.summary}</p>
                    <p className="mt-2 text-xs">
                      {b.parts.join(" · ")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Used on {used} equipment {used === 1 ? "card" : "cards"}
                    </p>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
      {editing ? (
        <BlockEditor
          block={editing}
          onClose={() => setEditing(null)}
          onSave={(block) => {
            dispatch({ type: "update-block", block });
            setEditing(null);
          }}
        />
      ) : null}
      {creating ? (
        <BlockEditor
          block={{
            id: "",
            family: "Other",
            title: "",
            summary: "",
            parts: ["Main assembly"],
            readings: [{ label: "Current", unit: "A", limit: "≤ FLA" }],
            runningChecks: ["Visual condition"],
            stoppedChecks: ["Isolated"],
          }}
          creating
          onClose={() => setCreating(false)}
          onSave={(block) => {
            const { id: _id, ...rest } = block;
            dispatch({ type: "add-block", block: rest });
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function BlockEditor({
  block,
  creating,
  onSave,
  onClose,
}: {
  block: UxBlock;
  creating?: boolean;
  onSave: (block: UxBlock) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(block);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    onSave({
      ...draft,
      title: draft.title.trim(),
      parts: draft.parts.map((p) => p.trim()).filter(Boolean),
      runningChecks: draft.runningChecks.map((c) => c.trim()).filter(Boolean),
      stoppedChecks: draft.stoppedChecks.map((c) => c.trim()).filter(Boolean),
    });
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
          <p className="text-xs text-muted-foreground">
            Save this and open Additive — the weigh-feeder drive and any other card on this
            block will show the new wording.
          </p>
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
              {BLOCK_FAMILIES.map((f) => (
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
              onChange={(e) =>
                setDraft({ ...draft, runningChecks: e.target.value.split("\n") })
              }
            />
          </div>
        </div>
        <div className="border-t border-border p-3">
          <Button type="submit" className="w-full">
            Save block
          </Button>
        </div>
      </form>
    </div>
  );
}

export function CoverageChips({ userId }: { userId: string }) {
  const { state } = useUx();
  const grants = state.grants.filter((g) => g.userId === userId);
  if (grants.length === 0) {
    return <p className="text-sm text-muted-foreground">No locations assigned.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {grants.map((g) => (
        <li key={`${g.kind}-${g.targetId}`} className="chip">
          {g.kind === "plant" ? "Plant" : g.kind === "section" ? "Section" : "Area"} ·{" "}
          {g.kind === "plant"
            ? state.plants.find((p) => p.id === g.targetId)?.name
            : g.kind === "section"
              ? state.sections.find((s) => s.id === g.targetId)?.name
              : state.areas.find((a) => a.id === g.targetId)?.name}
        </li>
      ))}
    </ul>
  );
}
