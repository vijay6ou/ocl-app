"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardList, Download, LayoutGrid, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PhotoCapture } from "@/components/photo-capture";
import { OkFailToggle, RunStopToggle } from "@/components/toggles";
import { ErrorState, LoadingState } from "@/components/states";
import { UpdatePanel } from "@/components/update-panel";
import { SubmitGate } from "@/components/submit-gate";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import {
  emptyCommonState,
  emptyEquipState,
  progressForDay,
  sanitizeDecimal,
} from "@/lib/progress";
import {
  SHIFT_OPTIONS,
  type Catalogue,
  type CommonState,
  type DayKey,
  type DraftState,
  type EquipState,
  type Equipment,
  type ShiftCode,
} from "@/lib/types";
import { isDayKey } from "@/lib/validate";
import { cn } from "@/lib/utils";

type Pane = "equipment" | "common" | "summary" | "update";

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function localDraftKey(userId: string, day: DayKey) {
  return `ocl-draft-v1:${userId}:${day}`;
}

function hasDraftWork(draft: DraftState) {
  if (draft.meta.shift && draft.meta.shift !== "G") return true;
  if (draft.meta.sup.trim()) return true;
  return (
    Object.values(draft.equip).some(
      (e) =>
        e.status ||
        e.remarks.trim() ||
        e.photos.length ||
        Object.values(e.params).some((p) => p.r || p.y || p.b || p.v) ||
        Object.values(e.checks).some(Boolean) ||
        Object.values(e.stoppedChecks).some(Boolean)
    ) ||
    Object.values(draft.common).some(
      (c) => c.ok || c.remarks.trim() || c.photos.length
    )
  );
}

function StatusPill({ status }: { status: "R" | "S" | null }) {
  if (status === "R")
    return <Badge className="rounded-full bg-emerald-700 text-[10px] tracking-wide text-white">RUNNING</Badge>;
  if (status === "S")
    return <Badge className="rounded-full bg-amber-600 text-[10px] tracking-wide text-white">STOPPED</Badge>;
  return (
    <Badge variant="outline" className="rounded-full text-[10px] tracking-wide">
      PENDING
    </Badge>
  );
}

export function ChecklistForm({
  day,
  initialCatalogue,
}: {
  day: string;
  initialCatalogue: Catalogue;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(initialCatalogue);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState<ShiftCode | "">("G");
  const [sup, setSup] = useState("");
  const [equip, setEquip] = useState<Record<string, EquipState>>({});
  const [common, setCommon] = useState<Record<string, CommonState>>({});
  const [draftBanner, setDraftBanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pane, setPane] = useState<Pane>("equipment");
  const [openId, setOpenId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [gateOpen, setGateOpen] = useState(false);
  const hydrated = useRef(false);
  const skipNextSave = useRef(true);

  const dayKey = isDayKey(day) ? day : null;

  const load = useCallback(async () => {
    if (!dayKey) {
      setError("There is no Sunday round. Pick Monday–Saturday.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/catalogue");
      setCatalogue(data.catalogue);
    } catch (err) {
      if (!initialCatalogue) {
        setError(err instanceof Error ? err.message : "Could not load the live catalogue.");
      }
    } finally {
      setLoading(false);
    }
  }, [dayKey, initialCatalogue]);

  useEffect(() => {
    if (initialCatalogue) return;
    void load();
  }, [load, initialCatalogue]);

  useEffect(() => {
    if (!user || !dayKey || hydrated.current) return;
    hydrated.current = true;
    let local: DraftState | null = null;
    try {
      const raw = localStorage.getItem(localDraftKey(user.id, dayKey));
      if (raw) local = JSON.parse(raw) as DraftState;
    } catch {
      local = null;
    }
    void (async () => {
      let server: DraftState | null = null;
      try {
        const data = await api<{ draft: DraftState | null }>(`/api/drafts?day=${dayKey}`);
        server = data.draft;
      } catch {
        server = null;
      }
      const pick =
        server && local
          ? (server.savedAt || "") >= (local.savedAt || "")
            ? server
            : local
          : (server ?? local);
      if (pick && hasDraftWork(pick)) {
        setDate(pick.meta.date || todayISO());
        setShift(pick.meta.shift || "G");
        setSup(pick.meta.sup);
        setEquip(pick.equip);
        setCommon(pick.common);
        setDraftBanner(true);
      }
      skipNextSave.current = false;
    })();
  }, [user, dayKey]);

  const section = dayKey && catalogue ? catalogue.days[dayKey] : null;

  useEffect(() => {
    if (!user || !dayKey || !section || skipNextSave.current) return;
    const draft: DraftState = {
      day: dayKey,
      savedAt: new Date().toISOString(),
      meta: { date, shift, sup },
      equip,
      common,
    };
    const localTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(localDraftKey(user.id, dayKey), JSON.stringify(draft));
      } catch {
        /* quota */
      }
    }, 350);
    const serverTimer = window.setTimeout(() => {
      setSaveState("saving");
      api<{ draft: DraftState }>("/api/drafts", {
        method: "PUT",
        body: JSON.stringify({ day: dayKey, date, shift, sup, equip, common }),
      })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("offline"));
    }, 900);
    return () => {
      window.clearTimeout(localTimer);
      window.clearTimeout(serverTimer);
    };
  }, [user, dayKey, section, date, shift, sup, equip, common]);

  const progress = useMemo(
    () => (section ? progressForDay(section, equip, common) : { done: 0, total: 0, pct: 0 }),
    [section, equip, common]
  );

  function patchEquip(id: string, patch: Partial<EquipState>) {
    setEquip((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyEquipState()), ...patch },
    }));
  }

  function patchCommon(id: string, patch: Partial<CommonState>) {
    setCommon((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyCommonState()), ...patch },
    }));
  }

  async function submit(gate: { selfieId: string; pin: string }) {
    if (!dayKey) return;
    if (!date || !shift) {
      toast.error("Date and shift are required before this round can be archived.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await api<{
        submission: { id: string };
        notify?: { warning?: string };
      }>("/api/submissions", {
        method: "POST",
        body: JSON.stringify({
          day: dayKey,
          date,
          shift,
          sup,
          equip,
          common,
          selfieId: gate.selfieId,
          pin: gate.pin,
        }),
      });
      if (user) {
        localStorage.removeItem(localDraftKey(user.id, dayKey));
        try {
          await api(`/api/drafts?day=${dayKey}`, { method: "DELETE" });
        } catch {
          /* draft leftover is harmless */
        }
      }
      toast.success("Checklist archived on the plant server.");
      if (data.notify?.warning) toast.warning(data.notify.warning);
      setGateOpen(false);
      router.push(`/log/${dayKey}/done?id=${data.submission.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function discardDraft() {
    setDate(todayISO());
    setShift("G");
    setSup("");
    setEquip({});
    setCommon({});
    setDraftBanner(false);
    if (user && dayKey) {
      localStorage.removeItem(localDraftKey(user.id, dayKey));
      void api(`/api/drafts?day=${dayKey}`, { method: "DELETE" }).catch(() => undefined);
    }
  }

  if (loading) return <LoadingState label="Loading live equipment catalogue from the server…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!section || !dayKey) {
    return <ErrorState message="That plant section is not in the catalogue." />;
  }

  const panes: { id: Pane; label: string; icon: typeof Wrench }[] = [
    { id: "equipment", label: "Equipment", icon: Wrench },
    { id: "common", label: "Common", icon: LayoutGrid },
    { id: "summary", label: "Summary", icon: ClipboardList },
    { id: "update", label: "Update", icon: Download },
  ];

  return (
    <div className="log-shell">
      <div className="log-progress">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase">
              Adani Cements — electrical maintenance
            </p>
            <h1 className="font-heading truncate text-xl font-semibold">{section.formLabel}</h1>
          </div>
          <div className="text-right">
            <div className="font-heading text-2xl font-bold leading-none">{progress.pct}%</div>
            <div className="text-xs text-white/70">
              {progress.done} / {progress.total}
            </div>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-[oklch(0.78_0.12_95)] transition-[width]"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-white/70">
          {saveState === "saving"
            ? "Saving draft…"
            : saveState === "saved"
              ? "Draft saved on the plant server"
              : saveState === "offline"
                ? "Draft kept on this phone — server unreachable"
                : "Changes auto-save. Submit only when you are ready."}
        </p>
      </div>

      <nav className="log-tabs-desktop" aria-label="Round sections">
        {panes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn("log-tab", pane === item.id && "log-tab-active")}
            onClick={() => setPane(item.id)}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>

      {draftBanner ? (
        <Alert className="mb-4">
          <AlertTitle>Draft restored</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Unfinished work for this section was restored. You can keep filling it in, then submit.
            <Button variant="outline" size="sm" onClick={discardDraft}>
              Discard draft
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {pane === "equipment" ? (
        <div className="space-y-1">
          <Card className="overflow-hidden border-primary/10 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Shift</CardTitle>
              <p className="text-xs text-muted-foreground">
                Default is General 09:00–18:00. Date and technician go on the archived report.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift">Shift</Label>
                <select
                  id="shift"
                  className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:h-8 md:text-sm"
                  value={shift}
                  onChange={(e) => setShift(e.target.value as ShiftCode | "")}
                >
                  {SHIFT_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Technician</Label>
                <Input value={user?.name ?? ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup">Supervisor</Label>
                <Input
                  id="sup"
                  value={sup}
                  onChange={(e) => setSup(e.target.value)}
                  placeholder="Name of supervisor on this shift"
                />
              </div>
            </CardContent>
          </Card>

          {section.equip.map((item) => (
            <EquipmentCard
              key={item.id}
              item={item}
              st={equip[item.id] ?? emptyEquipState()}
              open={openId === item.id}
              onToggle={() =>
              setOpenId((cur) => (cur === item.id ? null : item.id))
            }
              onPatch={(patch) => patchEquip(item.id, patch)}
            />
          ))}
        </div>
      ) : null}

      {pane === "common" ? (
        <div className="space-y-4">
          {section.common.length === 0 ? (
            <p className="text-sm text-muted-foreground">No common devices are configured for this section.</p>
          ) : (
            section.common.map((group) => (
              <Card key={group.id} className="overflow-hidden shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span>{group.icon}</span>
                    {group.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.items.map((item) => {
                    const st = common[item.id] ?? emptyCommonState();
                    return (
                      <div key={item.id} className="rounded-xl bg-[oklch(0.97_0.012_145)] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-xs text-muted-foreground">{item.tag}</div>
                            <div className="font-medium">{item.device}</div>
                            <p className="text-sm text-muted-foreground">{item.check}</p>
                          </div>
                          <OkFailToggle value={st.ok} onChange={(ok) => patchCommon(item.id, { ok })} />
                        </div>
                        {st.ok ? (
                          <div className="mt-3 space-y-2">
                            <Textarea
                              value={st.remarks}
                              onChange={(e) => patchCommon(item.id, { remarks: e.target.value })}
                              placeholder="Remarks (optional)"
                            />
                            <PhotoCapture
                              photos={st.photos}
                              kind="common"
                              commonId={item.id}
                              facing="environment"
                              gallery
                              label="Rear camera"
                              hint="Rear camera or insert from this phone’s gallery."
                              onChange={(photos) => patchCommon(item.id, { photos })}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {pane === "summary" ? (
        <Card className="relative z-0 overflow-hidden shadow-sm">
          <CardHeader className="pb-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
              Summary
            </p>
            <CardTitle className="text-xl">Ready to archive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Technician</dt>
                <dd>{user?.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date / shift</dt>
                <dd>
                  {date || "—"} · {SHIFT_OPTIONS.find((s) => s.code === shift)?.label ?? "Shift not selected"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Completion</dt>
                <dd>
                  {progress.pct}% ({progress.done}/{progress.total})
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Supervisor</dt>
                <dd>{sup || "—"}</dd>
              </div>
            </dl>
            <ul className="space-y-1 text-sm">
              {section.equip.map((item) => {
                const st = equip[item.id] ?? emptyEquipState();
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs">{item.tag}</span> {item.name}
                    </span>
                    <StatusPill status={st.status} />
                  </li>
                );
              })}
            </ul>
            {progress.pct < 100 ? (
              <p className="text-sm text-amber-800">
                Some statuses or checks are still open. You can still submit; the record will be marked PENDING.
              </p>
            ) : null}
            <Button
              size="lg"
              className="h-12 w-full sm:w-auto"
              disabled={submitting}
              onClick={() => {
                if (!date || !shift) {
                  toast.error("Date and shift are required before this round can be archived.");
                  return;
                }
                setGateOpen(true);
              }}
            >
              Submit checklist
            </Button>
            <div className="h-8 md:hidden" aria-hidden />
          </CardContent>
        </Card>
      ) : null}

      {pane === "update" ? <UpdatePanel /> : null}

      {gateOpen ? (
        <SubmitGate
          submitting={submitting}
          onCancel={() => setGateOpen(false)}
          onConfirm={(gate) => void submit(gate)}
        />
      ) : null}

      <nav className="log-tabs-mobile" aria-label="Round sections">
        {panes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn("log-tab-mobile", pane === item.id && "log-tab-mobile-active")}
            onClick={() => setPane(item.id)}
          >
            <item.icon className="size-5" />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function EquipmentCard({
  item,
  st,
  open,
  onToggle,
  onPatch,
}: {
  item: Equipment;
  st: EquipState;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<EquipState>) => void;
}) {
  const checks = st.status === "S" ? item.stoppedChecks : item.runningChecks;
  const answers = st.status === "S" ? st.stoppedChecks : st.checks;

  return (
    <article
      className="equip-card"
      data-status={st.status || "pending"}
      data-open={open ? "true" : "false"}
    >
      <div className="equip-card-head">
        <div className="min-w-0 flex-1 py-1 pr-1 pl-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip">{item.tag}</span>
            {item.isHT ? <Badge variant="secondary">HT</Badge> : null}
            <StatusPill status={st.status} />
          </div>
          <div className="mt-0 font-heading text-[0.88rem] leading-tight font-semibold">{item.name}</div>
        </div>
        <div className="equip-card-actions">
          <RunStopToggle
            value={st.status}
            onChange={(status) => {
              onPatch({ status });
            }}
          />
          <button
            type="button"
            className="equip-chevron"
            data-equip-id={item.id}
            aria-expanded={open}
            aria-label={open ? `Collapse ${item.name}` : `Expand ${item.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-1.5 border-t px-2.5 py-1.5">
          {!st.status ? (
            <p className="text-sm text-muted-foreground">
              Tap RUNNING or STOPPED for the matching readings and checks.
            </p>
          ) : null}

          {st.status === "R" && item.runningParams.length > 0 ? (
            <div className="space-y-1.5">
              {item.runningParams.map((param) => {
                const val = st.params[param.id] ?? {};
                const setVal = (next: typeof val) =>
                  onPatch({ params: { ...st.params, [param.id]: next } });
                return (
                  <div key={param.id} className="rounded-md bg-[oklch(0.97_0.012_145)] p-1.5">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <Label>{param.label}</Label>
                      <span className="text-[11px] text-muted-foreground">
                        {param.unit} {param.limit ? `· ${param.limit}` : ""}
                      </span>
                    </div>
                    {param.phases ? (
                      <div className="ryb-row">
                        {(["r", "y", "b"] as const).map((ph) => (
                          <label key={ph} className="ryb-cell">
                            <span className="ryb-letter" data-ph={ph}>
                              {ph.toUpperCase()}
                            </span>
                            <Input
                              inputMode="decimal"
                              className="h-9 min-w-0 border-0 bg-white text-center shadow-none"
                              value={val[ph] ?? ""}
                              onChange={(e) =>
                                setVal({ ...val, [ph]: sanitizeDecimal(e.target.value) })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Input
                        inputMode="decimal"
                        className="h-9 bg-white"
                        value={val.v ?? ""}
                        onChange={(e) => setVal({ ...val, v: sanitizeDecimal(e.target.value) })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {st.status && checks.length > 0 ? (
            <div className="space-y-1.5">
              {checks.map((check, index) => {
                const value = answers[String(index)] ?? null;
                return (
                  <div
                    key={`${item.id}-${index}`}
                    className="flex flex-col gap-1 rounded-md bg-[oklch(0.97_0.012_145)] p-1.5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <p className="text-sm leading-snug">{check}</p>
                    <OkFailToggle
                      value={value}
                      onChange={(next) => {
                        const key = st.status === "S" ? "stoppedChecks" : "checks";
                        onPatch({ [key]: { ...answers, [String(index)]: next } });
                      }}
                    />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                {Object.values(answers).filter(Boolean).length} of {checks.length} checks answered
              </p>
            </div>
          ) : null}

          {st.status ? (
            <div className="space-y-1">
              <Label htmlFor={`rem-${item.id}`}>Remarks</Label>
              <Textarea
                id={`rem-${item.id}`}
                value={st.remarks}
                onChange={(e) => onPatch({ remarks: e.target.value })}
                placeholder="Noise, leakage, missing guards, follow-up needed…"
              />
            </div>
          ) : null}

          {st.status ? (
            <div className="space-y-1 border-t pt-1.5">
              <Label>Photos</Label>
              <PhotoCapture
                photos={st.photos}
                kind={st.status === "S" ? "stopped" : "remark"}
                equipmentId={item.id}
                facing="environment"
                gallery
                label="Rear camera"
                hint="Rear camera or insert from this phone’s gallery."
                onChange={(photos) => onPatch({ photos })}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
