"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { instantiateFromBlock, instantiateSuperBlock, type EquipmentBlock, type SuperBlock } from "@/lib/equipment-blocks";
import { useAuth } from "@/components/auth-provider";
import { PlantTree } from "@/components/plant-tree";
import type {
  Catalogue,
  CommonGroup,
  CommonItem,
  DayCatalogue,
  Equipment,
  RunningParam,
} from "@/lib/types";
import {
  newCommonItemId,
  newEquipmentId,
  newGroupId,
  newParamId,
} from "@/lib/validate";
import { EquipmentBlockPicker } from "@/components/equipment-block-picker";

function moveItem<T>(items: T[], index: number, dir: -1 | 1) {
  const next = index + dir;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  const [row] = copy.splice(index, 1);
  copy.splice(next, 0, row);
  return copy;
}

function ReorderButtons({
  index,
  total,
  onMove,
  label,
}: {
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={`Move ${label} up`}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        aria-label={`Move ${label} down`}
      >
        <ChevronDown />
      </Button>
    </div>
  );
}

export function CatalogueHome({
  initial,
  user,
}: {
  initial?: Catalogue;
  user?: import("@/lib/types").PublicUser | null;
} = {}) {
  const auth = useAuth();
  const viewer = user ?? auth.user;
  const [catalogue, setCatalogue] = useState<Catalogue | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/catalogue");
      setCatalogue(data.catalogue);
    } catch (err) {
      if (!initial) setError(err instanceof Error ? err.message : "Could not load catalogue.");
    } finally {
      setLoading(false);
    }
  }, [initial]);

  useEffect(() => {
    if (initial) return;
    void load();
  }, [load, initial]);

  if (loading) return <LoadingState label="Loading live catalogue…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!catalogue || !viewer) return null;

  return (
    <PlantTree
      catalogue={catalogue}
      user={viewer}
      mode="admin"
      onCatalogue={setCatalogue}
    />
  );
}

export function CatalogueDayEditor({
  day,
  initialSection,
  areaName,
}: {
  day: string;
  initialSection: DayCatalogue;
  areaName: string;
}) {
  const [section, setSection] = useState<DayCatalogue | null>(structuredClone(initialSection));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const skipDraftAutosave = useRef(true);
  const [pickerAt, setPickerAt] = useState<"start" | "end" | null>(null);
  const [blocks, setBlocks] = useState<EquipmentBlock[]>([]);
  const [superBlocks, setSuperBlocks] = useState<SuperBlock[]>([]);
  const [copyTo, setCopyTo] = useState("");
  const [kitTitle, setKitTitle] = useState("");
  const [areas, setAreas] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    void api<{ blocks: EquipmentBlock[]; superBlocks?: SuperBlock[] }>("/api/blocks")
      .then((data) => {
        setBlocks(data.blocks);
        setSuperBlocks(data.superBlocks ?? []);
      })
      .catch(() => undefined);
    void api<{ catalogue: Catalogue }>("/api/catalogue")
      .then((data) => {
        setAreas(
          Object.entries(data.catalogue.days)
            .filter(([id]) => id !== day)
            .map(([id, area]) => ({ id, label: area.label }))
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      })
      .catch(() => undefined);
  }, [day]);

  useEffect(() => {
    let cancelled = false;
    void api<{ draft: { section: DayCatalogue; savedAt: string } | null }>(
      `/api/catalogue/drafts?areaId=${encodeURIComponent(day)}`
    )
      .then((data) => {
        if (cancelled) return;
        if (data.draft?.section) {
          setSection(structuredClone(data.draft.section));
          setDraftSavedAt(data.draft.savedAt);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/catalogue");
      const next = data.catalogue.days[day];
      setSection(next ? structuredClone(next) : null);
      if (!next) setError("That subsection is not on the plant catalogue.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this section.");
    } finally {
      setLoading(false);
    }
  }, [day]);

  async function saveDraft(quiet = false) {
    if (!section) return;
    if (!quiet) setDraftSaving(true);
    try {
      const data = await api<{ draft: { savedAt: string } }>("/api/catalogue/drafts", {
        method: "PUT",
        body: JSON.stringify({ areaId: day, section }),
      });
      setDraftSavedAt(data.draft.savedAt);
      if (!quiet) toast.success("Draft saved. Technicians still see the last published form.");
    } catch (err) {
      if (!quiet) toast.error(err instanceof Error ? err.message : "Could not save the draft.");
    } finally {
      if (!quiet) setDraftSaving(false);
    }
  }

  async function discardDraft() {
    skipDraftAutosave.current = true;
    try {
      await api(`/api/catalogue/drafts?areaId=${encodeURIComponent(day)}`, { method: "DELETE" });
      setDraftSavedAt(null);
      await reload();
      toast.success("Draft discarded. Showing the live published form.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not discard the draft.");
    }
  }

  async function save() {
    if (!section) return;
    skipDraftAutosave.current = true;
    setSaving(true);
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/catalogue", {
        method: "PUT",
        body: JSON.stringify({ sectionId: day, section }),
      });
      const next = data.catalogue.days[day];
      setSection(next ? structuredClone(next) : section);
      await api(`/api/catalogue/drafts?areaId=${encodeURIComponent(day)}`, { method: "DELETE" }).catch(
        () => undefined
      );
      setDraftSavedAt(null);
      toast.success("Form published. Technicians pick this up the next time they open the subsection.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish catalogue.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!draftReady || !section) return;
    if (skipDraftAutosave.current) {
      skipDraftAutosave.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      void saveDraft(true);
    }, 2000);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, section]);

  if (loading) return <LoadingState label="Loading section…" />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!section) return null;

  function setEquip(equip: Equipment[]) {
    setSection((prev) => (prev ? { ...prev, equip } : prev));
  }

  function updateEquip(id: string, patch: Partial<Equipment>) {
    setSection((prev) =>
      prev
        ? { ...prev, equip: prev.equip.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
        : prev
    );
  }

  function insertEquipment(blockId: string | null) {
    const at = pickerAt ?? "start";
    setPickerAt(null);
    setSection((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.equip.map((e) => e.id));
      const next: Equipment | null = blockId
        ? (() => {
            const source = blocks.find((b) => b.id === blockId);
            return source ? instantiateFromBlock(source, used) : null;
          })()
        : {
            id: newEquipmentId("new_equipment", used),
            tag: "NEW-TAG",
            name: "Untitled equipment",
            isHT: false,
            runningParams: [],
            runningChecks: [],
            stoppedChecks: [],
          };
      if (!next) return prev;
      return {
        ...prev,
        equip: at === "start" ? [next, ...prev.equip] : [...prev.equip, next],
      };
    });
  }

  function duplicateEquip(id: string) {
    setSection((prev) => {
      if (!prev) return prev;
      const source = prev.equip.find((e) => e.id === id);
      if (!source) return prev;
      const usedIds = new Set(prev.equip.map((e) => e.id));
      const usedTags = new Set(prev.equip.map((e) => e.tag));
      const usedParams = new Set<string>();
      const nextId = newEquipmentId(source.tag || "eq", usedIds);
      usedIds.add(nextId);
      let tag = source.tag.slice(0, 16);
      if (usedTags.has(tag)) {
        let n = 2;
        let candidate = `${source.tag}-${n}`.slice(0, 16);
        while (usedTags.has(candidate) && n < 50) {
          n += 1;
          candidate = `${source.tag}-${n}`.slice(0, 16);
        }
        tag = candidate;
      }
      const copy: Equipment = {
        ...source,
        id: nextId,
        tag,
        name: source.name.replace(/\s*\(copy\)\s*$/, "") + " (copy)",
        runningParams: source.runningParams.map((p) => {
          const pid = newParamId(p.label, usedParams);
          usedParams.add(pid);
          return { ...p, id: pid };
        }),
        runningChecks: [...source.runningChecks],
        stoppedChecks: [...source.stoppedChecks],
      };
      const at = prev.equip.findIndex((e) => e.id === id);
      const equip = [...prev.equip];
      equip.splice(at + 1, 0, copy);
      return { ...prev, equip };
    });
    toast.success("Copy is on this form. Change the tag and the one or two differences, then publish.");
  }

  function insertSuper(superId: string) {
    const at = pickerAt ?? "start";
    setPickerAt(null);
    const kit = superBlocks.find((s) => s.id === superId);
    if (!kit) return;
    setSection((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.equip.map((e) => e.id));
      const usedTags = new Set(prev.equip.map((e) => e.tag));
      const placed = instantiateSuperBlock(kit, used, usedTags, blocks);
      if (placed.length === 0) return prev;
      return {
        ...prev,
        equip: at === "start" ? [...placed, ...prev.equip] : [...prev.equip, ...placed],
      };
    });
    toast.success(`${kit.title} added (${kit.members.length} machines).`);
  }

  async function copyOnto() {
    if (!copyTo) return;
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/structure", {
        method: "POST",
        body: JSON.stringify({ action: "copy-area", fromId: day, toId: copyTo }),
      });
      const dest = data.catalogue.days[copyTo];
      toast.success(`Copied this form onto ${dest?.label ?? "the other area"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy this form.");
    }
  }

  async function saveAsSuper() {
    const title = kitTitle.trim();
    if (!title || !section) return;
    const withTypes = section.equip.filter((e) => e.blockId);
    if (withTypes.length === 0) {
      toast.error("This form has no library types to bundle. Add equipment blocks first.");
      return;
    }
    try {
      const data = await api<{ superBlocks: SuperBlock[] }>("/api/super-blocks", {
        method: "POST",
        body: JSON.stringify({
          title,
          summary: `${withTypes.length} machines from ${section.label}`,
          members: withTypes.map((e) => ({
            blockId: e.blockId,
            name: e.name,
            tag: e.tag,
          })),
        }),
      });
      setSuperBlocks(data.superBlocks);
      setKitTitle("");
      toast.success("Saved as a super block. Other areas can drop the whole kit in one tap.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the super block.");
    }
  }

  function addGroup() {
    setSection((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.common.map((g) => g.id));
      const id = newGroupId("new_group", used);
      const group: CommonGroup = {
        id,
        name: "Untitled group",
        color: "#333333",
        icon: "●",
        items: [],
      };
      return { ...prev, common: [...prev.common, group] };
    });
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" render={<Link href="/admin/catalogue" />}>
            ← All areas
          </Button>
          <h1 className="font-heading text-2xl font-semibold">
            {areaName} — {section.formLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            Add a super block to drop every motor in a kit, or one type at a time. Copy this whole
            form onto another area when two places are the same. Use <span className="font-medium text-foreground">Save draft</span> while you fill
            — leaving this page will not throw the half-filled card away. Publish when technicians
            should see it.
          </p>
          {draftSavedAt ? (
            <p className="mt-2 text-sm text-amber-800">
              Unpublished draft on the plant server
              {draftSavedAt ? ` · saved ${draftSavedAt.slice(11, 16)} UTC` : ""}. Technicians still
              run the last published form.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={draftSaving || saving}>
            {draftSaving ? "Saving draft…" : "Save draft"}
          </Button>
          {draftSavedAt ? (
            <Button type="button" variant="ghost" onClick={() => void discardDraft()} disabled={saving}>
              Discard draft
            </Button>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Publishing…" : "Publish to plant server"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Copy and reuse</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Copy this form onto</Label>
            <div className="flex gap-2">
              <select
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                value={copyTo}
                onChange={(e) => setCopyTo(e.target.value)}
              >
                <option value="">Choose area…</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" disabled={!copyTo} onClick={() => void copyOnto()}>
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Replaces that area’s equipment with a clone of this form. The other area keeps its name.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Save as super block</Label>
            <div className="flex gap-2">
              <Input
                value={kitTitle}
                onChange={(e) => setKitTitle(e.target.value)}
                placeholder="e.g. Stacker, Cement mill"
              />
              <Button type="button" variant="outline" disabled={!kitTitle.trim()} onClick={() => void saveAsSuper()}>
                Save kit
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Bundles the library types on this form so another area can add them in one tap.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#d4a017]/40 shadow-sm">
        <CardHeader>
          <CardTitle>Form title</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Day card label</Label>
            <Input
              value={section.label}
              onChange={(e) => setSection({ ...section, label: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Working section on reports</Label>
            <Input
              value={section.formLabel}
              onChange={(e) => setSection({ ...section, formLabel: e.target.value })}
              placeholder="Monday – Additive Section"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">Equipment questions</h2>
        <Button
          variant="outline"
          data-add="equip-top"
          onClick={() => setPickerAt("start")}
        >
          <Plus className="size-4" />
          Add equipment block
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The button above inserts at the top of this list. The dashed control at the bottom
        appends. A block includes the motor or transformer and its internal parts.
      </p>

      {section.equip.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No equipment on this form yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first machine, then attach parameter fields and OK/FAIL questions.
          </p>
          <Button className="mt-4" onClick={() => setPickerAt("start")}>
            <Plus className="size-4" />
            Add equipment block
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {section.equip.map((item, index) => (
            <EquipmentEditor
              key={item.id}
              item={item}
              index={index}
              total={section.equip.length}
              block={item.blockId ? blocks.find((b) => b.id === item.blockId) ?? null : null}
              onChange={(patch) => updateEquip(item.id, patch)}
              onMove={(dir) => setEquip(moveItem(section.equip, index, dir))}
              onDelete={() =>
                setEquip(section.equip.filter((e) => e.id !== item.id))
              }
              onCopy={() => duplicateEquip(item.id)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPickerAt("end")}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d4a017]/70 bg-white px-4 py-3 text-sm font-medium text-[#0d2137] hover:bg-[#d4a017]/10"
      >
        <Plus className="size-4" />
        Add equipment block
      </button>
      {pickerAt ? (
        <EquipmentBlockPicker
          blocks={blocks}
          superBlocks={superBlocks}
          onPick={(blockId) => insertEquipment(blockId)}
          onPickSuper={(id) => insertSuper(id)}
          onBlank={() => insertEquipment(null)}
          onClose={() => setPickerAt(null)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="font-heading text-lg font-semibold">Common device questions</h2>
        <Button variant="outline" onClick={addGroup}>
          <Plus className="size-4" />
          Add group
        </Button>
      </div>

      {section.common.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No common-device groups. Add a group, then add a question for each device.
        </div>
      ) : null}

      {section.common.map((group, gi) => (
        <CommonGroupEditor
          key={group.id}
          group={group}
          index={gi}
          total={section.common.length}
          usedIds={new Set(section.common.flatMap((g) => g.items.map((i) => i.id)))}
          onChange={(next) => {
            const common = [...section.common];
            common[gi] = next;
            setSection({ ...section, common });
          }}
          onMove={(dir) =>
            setSection({ ...section, common: moveItem(section.common, gi, dir) })
          }
          onDelete={() =>
            setSection({
              ...section,
              common: section.common.filter((g) => g.id !== group.id),
            })
          }
        />
      ))}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(13,33,55,0.08)] backdrop-blur md:hidden">
        <div className="flex gap-2">
          <Button className="flex-1" variant="outline" onClick={() => void saveDraft()} disabled={draftSaving || saving}>
            {draftSaving ? "Saving…" : "Save draft"}
          </Button>
          <Button className="flex-1" onClick={() => void save()} disabled={saving}>
            {saving ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EquipmentEditor({
  item,
  index,
  total,
  block,
  onChange,
  onMove,
  onDelete,
  onCopy,
}: {
  item: Equipment;
  index: number;
  total: number;
  block: EquipmentBlock | null;
  onChange: (patch: Partial<Equipment>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);
  function addParam(at: "start" | "end" = "end") {
    const used = new Set(item.runningParams.map((p) => p.id));
    const id = newParamId("new_reading", used);
    const field: RunningParam = {
      id,
      label: "New reading",
      unit: "",
      phases: false,
      limit: "",
    };
    onChange({
      runningParams:
        at === "start" ? [field, ...item.runningParams] : [...item.runningParams, field],
    });
  }

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="flex">
        <div className="w-1.5 shrink-0 bg-[#d4a017]" />
        <div className="flex-1">
          <CardHeader className="gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <ReorderButtons index={index} total={total} onMove={onMove} label="equipment" />
                <div>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Equipment {index + 1}
                  </p>
                  <CardTitle className="text-lg">{item.name || "Untitled equipment"}</CardTitle>
                </div>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={onCopy}>
                  <Copy className="size-3.5" />
                  Copy card
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete ${item.tag || item.name} from this form?`)) onDelete();
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={item.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder="Additive Truck Tippler"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tag</Label>
                <Input
                  value={item.tag}
                  onChange={(e) => onChange({ tag: e.target.value })}
                  placeholder="TT-001"
                />
              </div>
            </div>
            {block ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Follows library block: {block.title}. Parts: {block.parts.join(" · ")}. Edit the
                block in the library to change readings and checks on every form that uses it.
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.isHT}
                onChange={(e) => onChange({ isHT: e.target.checked })}
              />
              HT motor
            </label>
            <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <summary className="cursor-pointer select-none text-muted-foreground">
                Advanced — keep the OCL id unless you are replacing this machine
              </summary>
              <div className="mt-2 space-y-1.5">
                <Label>Catalogue id</Label>
                <Input value={item.id} onChange={(e) => onChange({ id: e.target.value })} />
              </div>
            </details>
          </CardHeader>
          <div className="px-6 pb-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
              {open ? "Hide fields" : `Show fields (${item.runningParams.length} readings, ${item.runningChecks.length + item.stoppedChecks.length} checks)`}
            </Button>
          </div>
          {open ? (
          <CardContent className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Parameter columns</h3>
                  <p className="text-xs text-muted-foreground">
                    Readings shown when the machine is RUNNING (current, voltage, temperature).
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  data-add="field-top"
                  onClick={() => addParam("start")}
                >
                  <Plus className="size-3.5" />
                  Add field
                </Button>
              </div>
              {item.runningParams.length === 0 ? (
                <button
                  type="button"
                  onClick={() => addParam("start")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground hover:bg-muted/40"
                >
                  <Plus className="size-4" />
                  Add field
                </button>
              ) : (
                <div className="space-y-2">
                  {item.runningParams.map((p, i) => (
                    <ParamRow
                      key={`${p.id}-${i}`}
                      param={p}
                      index={i}
                      total={item.runningParams.length}
                      onChange={(next) => {
                        const runningParams = [...item.runningParams];
                        runningParams[i] = next;
                        onChange({ runningParams });
                      }}
                      onMove={(dir) =>
                        onChange({ runningParams: moveItem(item.runningParams, i, dir) })
                      }
                      onDelete={() =>
                        onChange({
                          runningParams: item.runningParams.filter((_, idx) => idx !== i),
                        })
                      }
                    />
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addParam("end")}>
                    <Plus className="size-3.5" />
                    Add field
                  </Button>
                </div>
              )}
            </section>
            <CheckEditor
              title="Running checks"
              hint="Questions technicians mark OK or FAIL while the machine is running."
              addLabel="Add question"
              checks={item.runningChecks}
              onChange={(runningChecks) => onChange({ runningChecks })}
            />
            <CheckEditor
              title="Stopped checks"
              hint="Questions used when the machine is STOPPED (isolation, IR, earth)."
              addLabel="Add question"
              checks={item.stoppedChecks}
              onChange={(stoppedChecks) => onChange({ stoppedChecks })}
            />
          </CardContent>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ParamRow({
  param,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  param: RunningParam;
  index: number;
  total: number;
  onChange: (next: RunningParam) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Field {index + 1}</p>
        <div className="flex items-center">
          <ReorderButtons index={index} total={total} onMove={onMove} label="field" />
          <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete field">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Question / column title</Label>
          <Input
            value={param.label}
            onChange={(e) => onChange({ ...param, label: e.target.value })}
            placeholder="Stator Current"
          />
        </div>
        <div className="space-y-1">
          <Label>Unit</Label>
          <Input
            value={param.unit}
            onChange={(e) => onChange({ ...param, unit: e.target.value })}
            placeholder="A"
          />
        </div>
        <div className="space-y-1">
          <Label>Limit</Label>
          <Input
            value={param.limit}
            onChange={(e) => onChange({ ...param, limit: e.target.value })}
            placeholder="≤ FLA"
          />
        </div>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={param.phases}
          onChange={(e) => onChange({ ...param, phases: e.target.checked })}
        />
        Three-phase R / Y / B columns
      </label>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Field id (keep stable)</summary>
        <Input
          className="mt-1"
          value={param.id}
          onChange={(e) => onChange({ ...param, id: e.target.value })}
        />
      </details>
    </div>
  );
}

function CheckEditor({
  title,
  hint,
  addLabel,
  checks,
  onChange,
}: {
  title: string;
  hint: string;
  addLabel: string;
  checks: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onChange([...checks, ""])}>
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>
      {checks.length === 0 ? (
        <button
          type="button"
          onClick={() => onChange([""])}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground hover:bg-muted/40"
        >
          <Plus className="size-4" />
          {addLabel}
        </button>
      ) : (
        <div className="space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border bg-white p-2">
              <ReorderButtons
                index={i}
                total={checks.length}
                onMove={(dir) => onChange(moveItem(checks, i, dir))}
                label="question"
              />
              <Textarea
                value={c}
                onChange={(e) => {
                  const next = [...checks];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                placeholder="Visual inspection of terminal box and earthing"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(checks.filter((_, idx) => idx !== i))}
                aria-label="Delete question"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => onChange([...checks, ""])}>
            <Plus className="size-3.5" />
            {addLabel}
          </Button>
        </div>
      )}
    </section>
  );
}

function CommonGroupEditor({
  group,
  index,
  total,
  usedIds,
  onChange,
  onMove,
  onDelete,
}: {
  group: CommonGroup;
  index: number;
  total: number;
  usedIds: Set<string>;
  onChange: (next: CommonGroup) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  function addDevice() {
    const id = newCommonItemId(`${group.id}_item`, usedIds);
    const item: CommonItem = {
      id,
      tag: "NEW",
      device: "Untitled device",
      check: "Operate and verify",
    };
    onChange({ ...group, items: [...group.items, item] });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-1 items-start gap-2">
          <ReorderButtons index={index} total={total} onMove={onMove} label="group" />
          <div className="flex-1 space-y-1.5">
            <Label>Group name</Label>
            <Input
              value={group.name}
              onChange={(e) => onChange({ ...group, name: e.target.value })}
            />
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          Delete group
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.items.length === 0 ? (
          <button
            type="button"
            onClick={addDevice}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground hover:bg-muted/40"
          >
            <Plus className="size-4" />
            Add question
          </button>
        ) : (
          group.items.map((item, i) => (
            <div key={item.id} className="flex items-start gap-2 rounded-lg border p-2">
              <ReorderButtons
                index={i}
                total={group.items.length}
                onMove={(dir) => onChange({ ...group, items: moveItem(group.items, i, dir) })}
                label="device"
              />
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <Input
                  value={item.tag}
                  onChange={(e) => {
                    const items = [...group.items];
                    items[i] = { ...item, tag: e.target.value };
                    onChange({ ...group, items });
                  }}
                  placeholder="Tag"
                />
                <Input
                  value={item.device}
                  onChange={(e) => {
                    const items = [...group.items];
                    items[i] = { ...item, device: e.target.value };
                    onChange({ ...group, items });
                  }}
                  placeholder="Device"
                />
                <Input
                  value={item.check}
                  onChange={(e) => {
                    const items = [...group.items];
                    items[i] = { ...item, check: e.target.value };
                    onChange({ ...group, items });
                  }}
                  placeholder="Question"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  onChange({
                    ...group,
                    items: group.items.filter((_, idx) => idx !== i),
                  })
                }
                aria-label="Delete device"
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
        <Button variant="outline" size="sm" onClick={addDevice}>
          <Plus className="size-3.5" />
          Add question
        </Button>
      </CardContent>
    </Card>
  );
}
