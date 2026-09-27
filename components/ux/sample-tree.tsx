"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Factory, Layers, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  coverageOfArea,
  hasGrant,
  isAdmin,
  visibleAreas,
  visiblePlants,
  visibleSections,
} from "@/lib/ux-mock";
import { AreaRound, BlockLibrary, NameAdd } from "@/components/ux/shared";
import { useUx } from "@/components/ux/store";

type Sel =
  | { kind: "home" }
  | { kind: "plant"; id: string }
  | { kind: "section"; id: string }
  | { kind: "area"; id: string }
  | { kind: "library" }
  | { kind: "access"; userId: string };

export function SampleTree() {
  const { state, dispatch } = useUx();
  const admin = isAdmin(state);
  const [sel, setSel] = useState<Sel>({ kind: "home" });
  const [openPlants, setOpenPlants] = useState<Record<string, boolean>>({
    "plt-chittapur": true,
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "sec-mh": true,
  });
  const plants = visiblePlants(state);

  const title = useMemo(() => {
    if (sel.kind === "library") return "Block library";
    if (sel.kind === "access") {
      return state.people.find((p) => p.id === sel.userId)?.name ?? "Access";
    }
    if (sel.kind === "area") return state.areas.find((a) => a.id === sel.id)?.name ?? "";
    if (sel.kind === "section") return state.sections.find((s) => s.id === sel.id)?.name ?? "";
    if (sel.kind === "plant") return state.plants.find((p) => p.id === sel.id)?.name ?? "";
    return "Choose a location";
  }, [sel, state]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-0 md:flex-row md:items-stretch">
      <aside className="border-b border-border bg-[oklch(0.32_0.06_155)] text-white md:w-72 md:border-b-0 md:border-r md:border-white/10">
        <div className="px-3 py-3">
          <p className="text-[11px] tracking-[0.14em] text-white/60 uppercase">Plant tree</p>
          <p className="font-heading text-lg">Locations</p>
        </div>
        <nav className="max-h-[40vh] overflow-y-auto px-2 pb-3 md:max-h-[calc(100vh-11rem)]">
          {plants.map((plant) => {
            const plantOpen = openPlants[plant.id] ?? true;
            return (
              <div key={plant.id} className="mb-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-white/10"
                    onClick={() =>
                      setOpenPlants((o) => ({ ...o, [plant.id]: !plantOpen }))
                    }
                    aria-label={plantOpen ? "Collapse plant" : "Expand plant"}
                  >
                    {plantOpen ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSel({ kind: "plant", id: plant.id })}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      sel.kind === "plant" && sel.id === plant.id ? "bg-white/15" : "hover:bg-white/10"
                    }`}
                  >
                    <Factory className="size-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{plant.name}</span>
                  </button>
                </div>
                {plantOpen
                  ? visibleSections(state, plant.id).map((section) => {
                      const secOpen = openSections[section.id] ?? true;
                      return (
                        <div key={section.id} className="ml-4">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded p-1 hover:bg-white/10"
                              onClick={() =>
                                setOpenSections((o) => ({ ...o, [section.id]: !secOpen }))
                              }
                            >
                              {secOpen ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSel({ kind: "section", id: section.id })}
                              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${
                                sel.kind === "section" && sel.id === section.id
                                  ? "bg-white/15"
                                  : "hover:bg-white/10"
                              }`}
                            >
                              <Layers className="size-3.5 shrink-0 opacity-80" />
                              <span className="truncate">{section.name}</span>
                            </button>
                          </div>
                          {secOpen
                            ? visibleAreas(state, section.id).map((area) => (
                                <button
                                  key={area.id}
                                  type="button"
                                  onClick={() => setSel({ kind: "area", id: area.id })}
                                  className={`ml-7 flex w-[calc(100%-1.75rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${
                                    sel.kind === "area" && sel.id === area.id
                                      ? "bg-white/15"
                                      : "hover:bg-white/10"
                                  }`}
                                >
                                  <MapPin className="size-3.5 shrink-0 opacity-80" />
                                  <span className="truncate">{area.name}</span>
                                </button>
                              ))
                            : null}
                          {admin && secOpen ? (
                            <div className="ml-10 mt-1 mb-2 rounded-lg bg-white p-1.5 text-foreground">
                              <NameAdd
                                placeholder="New area"
                                label="Add area"
                                onAdd={(name) =>
                                  dispatch({ type: "add-area", sectionId: section.id, name })
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : null}
                {admin && plantOpen ? (
                  <div className="ml-8 mt-1 mb-2 rounded-lg bg-white p-1.5 text-foreground">
                    <NameAdd
                      placeholder="New section"
                      label="Add section"
                      onAdd={(name) =>
                        dispatch({ type: "add-section", plantId: plant.id, name })
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {admin ? (
            <div className="mt-3 border-t border-white/10 px-1 pt-3">
              <div className="rounded-lg bg-white p-1.5 text-foreground">
                <NameAdd
                  placeholder="Plant name"
                  label="Add plant"
                  onAdd={(name) => dispatch({ type: "add-plant", name })}
                />
              </div>
            </div>
          ) : null}
        </nav>
        {admin ? (
          <div className="border-t border-white/10 p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-white hover:bg-white/10"
              onClick={() => setSel({ kind: "library" })}
            >
              Block library
            </Button>
            {state.people
              .filter((p) => p.role === "technician")
              .map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="ghost"
                  className="w-full justify-start text-white hover:bg-white/10"
                  onClick={() => setSel({ kind: "access", userId: p.id })}
                >
                  Access · {p.name}
                </Button>
              ))}
          </div>
        ) : null}
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        {sel.kind === "home" ? (
          <div className="max-w-xl">
            <h1 className="font-heading text-3xl font-semibold">Desk with a tree</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Plant at the top, section in the middle, area at the leaf. Click Additive to see a
              live round form. Switch to Suresh in the header — Bauxite disappears because he is
              not assigned there.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Now showing: {title}</p>
          </div>
        ) : null}
        {sel.kind === "plant" ? (
          <PlantPane plantId={sel.id} />
        ) : null}
        {sel.kind === "section" ? (
          <SectionPane sectionId={sel.id} onOpenArea={(id) => setSel({ kind: "area", id })} />
        ) : null}
        {sel.kind === "area" ? <AreaRound areaId={sel.id} /> : null}
        {sel.kind === "library" ? <BlockLibrary canEdit={admin} /> : null}
        {sel.kind === "access" ? <TreeAccess userId={sel.userId} /> : null}
      </main>
    </div>
  );
}

function PlantPane({ plantId }: { plantId: string }) {
  const { state } = useUx();
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) return null;
  const sections = visibleSections(state, plantId);
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Plant</p>
      <h2 className="font-heading text-2xl font-semibold">{plant.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {sections.length === 0
          ? "No sections yet. Add one from the tree — it starts empty."
          : `${sections.length} section${sections.length === 1 ? "" : "s"} under this plant.`}
      </p>
      <ul className="mt-4 space-y-2">
        {sections.map((s) => (
          <li key={s.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            {s.name}
            <span className="ml-2 text-xs text-muted-foreground">
              {visibleAreas(state, s.id).length} areas
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionPane({
  sectionId,
  onOpenArea,
}: {
  sectionId: string;
  onOpenArea: (id: string) => void;
}) {
  const { state } = useUx();
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  const areas = visibleAreas(state, sectionId);
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
        Section
      </p>
      <h2 className="font-heading text-2xl font-semibold">{section.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {areas.length === 0
          ? "Empty section. Add Additive-style areas when you are ready."
          : "Open an area to fill the round."}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpenArea(a.id)}
            className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10"
          >
            <span className="font-heading text-lg">{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TreeAccess({ userId }: { userId: string }) {
  const { state, dispatch } = useUx();
  const person = state.people.find((p) => p.id === userId);
  if (!person) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Access
        </p>
        <h2 className="font-heading text-2xl font-semibold">{person.name}</h2>
        <p className="text-sm text-muted-foreground">
          Tick a plant, a section, or a single area. A higher tick covers everything under it.
        </p>
      </div>
      {state.plants.map((plant) => {
        const plantOn = hasGrant(state, userId, "plant", plant.id);
        return (
          <div key={plant.id} className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={plantOn}
                onChange={() =>
                  dispatch({ type: "toggle-grant", userId, kind: "plant", targetId: plant.id })
                }
              />
              Whole plant · {plant.name}
            </label>
            {state.sections
              .filter((s) => s.plantId === plant.id)
              .map((section) => {
                const secOn = hasGrant(state, userId, "section", section.id);
                return (
                  <div key={section.id} className="mt-2 ml-5">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={secOn}
                        disabled={plantOn}
                        onChange={() =>
                          dispatch({
                            type: "toggle-grant",
                            userId,
                            kind: "section",
                            targetId: section.id,
                          })
                        }
                      />
                      Whole section · {section.name}
                      {plantOn ? (
                        <span className="text-xs text-muted-foreground">(from plant)</span>
                      ) : null}
                    </label>
                    <div className="mt-1 ml-5 flex flex-col gap-1">
                      {state.areas
                        .filter((a) => a.sectionId === section.id)
                        .map((area) => {
                          const cover = coverageOfArea(state, userId, area.id);
                          const exact = hasGrant(state, userId, "area", area.id);
                          return (
                            <label key={area.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={cover !== "none"}
                                disabled={cover === "plant" || cover === "section"}
                                onChange={() =>
                                  dispatch({
                                    type: "toggle-grant",
                                    userId,
                                    kind: "area",
                                    targetId: area.id,
                                  })
                                }
                              />
                              {area.name}
                              {cover === "plant" || cover === "section" ? (
                                <span className="text-xs text-muted-foreground">
                                  (from {cover})
                                </span>
                              ) : exact ? (
                                <span className="text-xs text-muted-foreground">area only</span>
                              ) : null}
                            </label>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
