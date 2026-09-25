"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { DAY_BLURBS, DAY_KEYS } from "@/lib/constants";
import type {
  Catalogue,
  CommonGroup,
  CommonItem,
  DayCatalogue,
  DayKey,
  Equipment,
  RunningParam,
} from "@/lib/types";
import {
  newCommonItemId,
  newEquipmentId,
  newGroupId,
  newParamId,
} from "@/lib/validate";

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

export function CatalogueHome({ initial }: { initial?: Catalogue } = {}) {
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
  if (!catalogue) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Equipment catalogue</h1>
        <p className="text-sm text-muted-foreground">
          Build each weekday like a form: add equipment, add parameter fields, add OK/FAIL
          questions. Publish to the plant server so technicians get the new list on the next
          load.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Last published {new Date(catalogue.updatedAt).toLocaleString()}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {DAY_KEYS.map((key) => {
          const day = catalogue.days[key];
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{DAY_BLURBS[key].weekday} – {DAY_BLURBS[key].section}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {day.equip.length} equipment ·{" "}
                  {day.common.reduce((n, g) => n + g.items.length, 0)} common devices
                </p>
                <Button render={<Link href={`/admin/catalogue/${key}`} />}>Edit form</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function CatalogueDayEditor({ day }: { day: DayKey }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [section, setSection] = useState<DayCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/catalogue");
      setCatalogue(data.catalogue);
      setSection(structuredClone(data.catalogue.days[day]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this section.");
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!catalogue || !section) return;
    setSaving(true);
    try {
      const days = { ...catalogue.days, [day]: section };
      const data = await api<{ catalogue: Catalogue }>("/api/catalogue", {
        method: "PUT",
        body: JSON.stringify({ days }),
      });
      setCatalogue(data.catalogue);
      setSection(structuredClone(data.catalogue.days[day]));
      toast.success("Form published. Technicians pick this up the next time they open the day.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish catalogue.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading section…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
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

  function addEquipment(at: "start" | "end" = "end") {
    setSection((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.equip.map((e) => e.id));
      const id = newEquipmentId("new_equipment", used);
      const next: Equipment = {
        id,
        tag: "NEW-TAG",
        name: "Untitled equipment",
        isHT: false,
        runningParams: [],
        runningChecks: [],
        stoppedChecks: [],
      };
      return {
        ...prev,
        equip: at === "start" ? [next, ...prev.equip] : [...prev.equip, next],
      };
    });
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
            ← All sections
          </Button>
          <h1 className="font-heading text-2xl font-semibold">
            {DAY_BLURBS[day].weekday} – {DAY_BLURBS[day].section}
          </h1>
          <p className="text-sm text-muted-foreground">
            Forms-style builder. Existing OCL ids and tags stay as they are unless you change
            them.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Publishing…" : "Publish to plant server"}
        </Button>
      </div>

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
          onClick={() => addEquipment("start")}
        >
          <Plus className="size-4" />
          Add equipment
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The button above inserts at the top of this list. The dashed control at the bottom
        appends.
      </p>

      {section.equip.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No equipment on this form yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first machine, then attach parameter fields and OK/FAIL questions.
          </p>
          <Button className="mt-4" onClick={() => addEquipment("start")}>
            <Plus className="size-4" />
            Add equipment
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
              onChange={(patch) => updateEquip(item.id, patch)}
              onMove={(dir) => setEquip(moveItem(section.equip, index, dir))}
              onDelete={() =>
                setEquip(section.equip.filter((e) => e.id !== item.id))
              }
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => addEquipment("end")}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d4a017]/70 bg-white px-4 py-3 text-sm font-medium text-[#0d2137] hover:bg-[#d4a017]/10"
      >
        <Plus className="size-4" />
        Add equipment
      </button>

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
        <Button className="w-full" onClick={() => void save()} disabled={saving}>
          {saving ? "Publishing…" : "Publish to plant server"}
        </Button>
      </div>
    </div>
  );
}

function EquipmentEditor({
  item,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  item: Equipment;
  index: number;
  total: number;
  onChange: (patch: Partial<Equipment>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
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
