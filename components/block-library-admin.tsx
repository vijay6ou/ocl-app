"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { blockFamilies, type EquipmentBlock, type SuperBlock } from "@/lib/equipment-blocks";

const FAMILIES = [
  "Low-tension motors",
  "High-tension motors",
  "Transformers",
  "Plant drives",
  "Other",
];

export function BlockLibraryAdmin({
  initial,
  initialSuper,
}: {
  initial: EquipmentBlock[];
  initialSuper: SuperBlock[];
}) {
  const [blocks, setBlocks] = useState(initial);
  const [superBlocks, setSuperBlocks] = useState(initialSuper);
  const [editing, setEditing] = useState<EquipmentBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingKit, setEditingKit] = useState<SuperBlock | null>(null);
  const [creatingKit, setCreatingKit] = useState(false);
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
            Types are one motor or transformer. Super blocks are kits — a stacker with five
            motors, a mill with ten. Changing a type still live-updates cards already on forms.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setCreatingKit(true)}>
            New super block
          </Button>
          <Button type="button" onClick={() => setCreating(true)}>
            New block type
          </Button>
        </div>
      </div>
      <section>
        <h2 className="mb-2 font-heading text-lg">Super blocks</h2>
        {superBlocks.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No kits yet. Build one from types below, or save a finished area as a super block.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {superBlocks.map((kit) => (
              <button
                key={kit.id}
                type="button"
                onClick={() => setEditingKit(kit)}
                className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10"
              >
                <p className="font-heading text-lg font-semibold">{kit.title}</p>
                <p className="text-sm text-muted-foreground">{kit.summary}</p>
                <p className="mt-2 text-xs">
                  {kit.members.length} machines · {kit.members.map((m) => m.name || m.tag).join(" · ")}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
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
      {editingKit ? (
        <SuperBlockForm
          kit={editingKit}
          types={blocks}
          onClose={() => setEditingKit(null)}
          onSave={async (kit) => {
            const data = await api<{ superBlocks: SuperBlock[] }>("/api/super-blocks", {
              method: "PUT",
              body: JSON.stringify({ superBlock: kit }),
            });
            setSuperBlocks(data.superBlocks);
            setEditingKit(null);
            toast.success("Super block saved.");
          }}
          onDelete={async () => {
            const data = await api<{ superBlocks: SuperBlock[] }>(`/api/super-blocks?id=${editingKit.id}`, {
              method: "DELETE",
            });
            setSuperBlocks(data.superBlocks);
            setEditingKit(null);
            toast.success("Super block removed.");
          }}
        />
      ) : null}
      {creatingKit ? (
        <SuperBlockForm
          creating
          kit={{ id: "", title: "", summary: "", members: [] }}
          types={blocks}
          onClose={() => setCreatingKit(false)}
          onSave={async (kit) => {
            const data = await api<{ superBlocks: SuperBlock[] }>("/api/super-blocks", {
              method: "POST",
              body: JSON.stringify(kit),
            });
            setSuperBlocks(data.superBlocks);
            setCreatingKit(false);
            toast.success("Super block is in the library.");
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

function SuperBlockForm({
  kit,
  types,
  creating,
  onSave,
  onClose,
  onDelete,
}: {
  kit: SuperBlock;
  types: EquipmentBlock[];
  creating?: boolean;
  onSave: (kit: SuperBlock) => Promise<void>;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(kit);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState(types[0]?.id ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim() || draft.members.length === 0) return;
    setBusy(true);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        members: draft.members.filter((m) => m.blockId),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this super block.");
    } finally {
      setBusy(false);
    }
  }

  function addMember() {
    const type = types.find((b) => b.id === addId);
    if (!type) return;
    setDraft({
      ...draft,
      members: [
        ...draft.members,
        { blockId: type.id, name: type.defaultName, tag: type.defaultTag },
      ],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <form
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-heading text-lg">{creating ? "New super block" : "Edit super block"}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">
            Example: a stacker with five different motors. Add each type once, name it for that
            machine, then drop the whole kit on a form.
          </p>
          <div>
            <Label htmlFor="kit-title">Name</Label>
            <Input
              id="kit-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Stacker"
              required
            />
          </div>
          <div>
            <Label htmlFor="kit-sum">Summary</Label>
            <Input
              id="kit-sum"
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              placeholder="Travel, luff, boom, and tripper motors"
            />
          </div>
          <div className="space-y-2">
            <Label>Machines in this kit</Label>
            {draft.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add the first motor type below.</p>
            ) : null}
            {draft.members.map((member, index) => (
              <div key={`${member.blockId}-${index}`} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                  value={member.blockId}
                  onChange={(e) => {
                    const type = types.find((b) => b.id === e.target.value);
                    const next = [...draft.members];
                    next[index] = {
                      blockId: e.target.value,
                      name: member.name || type?.defaultName || "",
                      tag: member.tag || type?.defaultTag || "",
                    };
                    setDraft({ ...draft, members: next });
                  }}
                >
                  {types.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
                <Input
                  value={member.name}
                  onChange={(e) => {
                    const next = [...draft.members];
                    next[index] = { ...member, name: e.target.value };
                    setDraft({ ...draft, members: next });
                  }}
                  placeholder="Role on this machine"
                />
                <div className="flex gap-1">
                  <Input
                    className="w-24"
                    value={member.tag}
                    onChange={(e) => {
                      const next = [...draft.members];
                      next[index] = { ...member, tag: e.target.value };
                      setDraft({ ...draft, members: next });
                    }}
                    placeholder="TAG"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft({ ...draft, members: draft.members.filter((_, i) => i !== index) })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <select
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                {types.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={addMember} disabled={!addId}>
                Add type
              </Button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Delete
            </Button>
          ) : null}
          <Button type="submit" className="flex-1" disabled={busy || draft.members.length === 0}>
            {busy ? "Saving…" : "Save super block"}
          </Button>
        </div>
      </form>
    </div>
  );
}