"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assignedAreas,
  isAdmin,
  pathForArea,
  placedInArea,
  visibleAreas,
  visiblePlants,
  visibleSections,
} from "@/lib/ux-mock";
import { AreaRound, BlockLibrary, CoverageChips, NameAdd } from "@/components/ux/shared";
import { useUx } from "@/components/ux/store";
import { TreeAccess } from "@/components/ux/sample-tree";

type Path =
  | { view: "home" }
  | { view: "plant"; plantId: string }
  | { view: "section"; plantId: string; sectionId: string }
  | { view: "area"; plantId: string; sectionId: string; areaId: string }
  | { view: "library" }
  | { view: "access" };

export function SampleCards() {
  const { state, dispatch } = useUx();
  const admin = isAdmin(state);
  const [path, setPath] = useState<Path>({ view: "home" });

  if (!admin) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Your rounds
          </p>
          <h1 className="font-heading text-3xl font-semibold">Assigned areas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the plant, section, and area you were given. Open a card to fill the round.
          </p>
        </header>
        {path.view === "area" ? (
          <div className="space-y-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPath({ view: "home" })}>
              ← All assigned areas
            </Button>
            <AreaRound areaId={path.areaId} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assignedAreas(state).map((area) => {
              const trail = pathForArea(state, area.id);
              const n = placedInArea(state, area.id).length;
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() =>
                    setPath({
                      view: "area",
                      plantId: state.sections.find((s) => s.id === area.sectionId)?.plantId ?? "",
                      sectionId: area.sectionId,
                      areaId: area.id,
                    })
                  }
                  className="day-card p-4 text-left"
                >
                  <div className="flex gap-3">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                      <span className="font-heading text-sm">{area.badge}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-heading text-xl font-semibold">{area.name}</h2>
                        <ChevronRight className="mt-1 size-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {trail.plant} · {trail.section}
                      </p>
                      <span className="chip mt-2 inline-flex">
                        {n === 0 ? "No equipment yet" : `${n} equipment`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={path.view !== "library" && path.view !== "access" ? "default" : "outline"}
          onClick={() => setPath({ view: "home" })}
        >
          Structure
        </Button>
        <Button
          type="button"
          size="sm"
          variant={path.view === "library" ? "default" : "outline"}
          onClick={() => setPath({ view: "library" })}
        >
          Block library
        </Button>
        <Button
          type="button"
          size="sm"
          variant={path.view === "access" ? "default" : "outline"}
          onClick={() => setPath({ view: "access" })}
        >
          Access
        </Button>
      </div>

      {path.view === "library" ? <BlockLibrary canEdit /> : null}
      {path.view === "access" ? <CardsAccess /> : null}

      {path.view !== "library" && path.view !== "access" ? (
        <>
          <Breadcrumb path={path} onGo={setPath} />
          {path.view === "home" ? (
            <div>
              <h1 className="font-heading text-3xl font-semibold">Plants</h1>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Tap a plant, then a section, then an area — one level at a time, same cards as
                the weekday list. Add empty plants when a new works comes online.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {visiblePlants(state).map((plant) => {
                  const n = visibleSections(state, plant.id).length;
                  return (
                    <button
                      key={plant.id}
                      type="button"
                      onClick={() => setPath({ view: "plant", plantId: plant.id })}
                      className="day-card p-5 text-left"
                    >
                      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
                        Plant
                      </p>
                      <h2 className="font-heading text-2xl font-semibold">{plant.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {n === 0 ? "No sections yet" : `${n} sections`}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 max-w-md">
                <NameAdd
                  placeholder="Another plant name"
                  label="Add plant"
                  onAdd={(name) => dispatch({ type: "add-plant", name })}
                />
              </div>
            </div>
          ) : null}
          {path.view === "plant" ? (
            <div>
              <h1 className="font-heading text-3xl font-semibold">
                {state.plants.find((p) => p.id === path.plantId)?.name}
              </h1>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Sections of this plant. Raw mill or kiln would be added here when you need them —
                they are not pre-loaded.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleSections(state, path.plantId).map((section) => {
                  const n = visibleAreas(state, section.id).length;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() =>
                        setPath({
                          view: "section",
                          plantId: path.plantId,
                          sectionId: section.id,
                        })
                      }
                      className="day-card p-5 text-left"
                    >
                      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
                        Section
                      </p>
                      <h2 className="font-heading text-2xl font-semibold">{section.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {n === 0 ? "Empty — add areas when ready" : `${n} areas`}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 max-w-md">
                <NameAdd
                  placeholder="Section name, e.g. Kiln"
                  label="Add section"
                  onAdd={(name) =>
                    dispatch({ type: "add-section", plantId: path.plantId, name })
                  }
                />
              </div>
            </div>
          ) : null}
          {path.view === "section" ? (
            <div>
              <h1 className="font-heading text-3xl font-semibold">
                {state.sections.find((s) => s.id === path.sectionId)?.name}
              </h1>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Small areas — Additive, Gypsum, LC-8. These used to be the weekday forms.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleAreas(state, path.sectionId).map((area) => {
                  const n = placedInArea(state, area.id).length;
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() =>
                        setPath({
                          view: "area",
                          plantId: path.plantId,
                          sectionId: path.sectionId,
                          areaId: area.id,
                        })
                      }
                      className="day-card p-4 text-left"
                    >
                      <div className="flex gap-3">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                          <span className="font-heading text-sm">{area.badge}</span>
                        </div>
                        <div>
                          <h2 className="font-heading text-xl font-semibold">{area.name}</h2>
                          <span className="chip">
                            {n === 0 ? "No equipment yet" : `${n} equipment`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 max-w-md">
                <NameAdd
                  placeholder="Area name"
                  label="Add area"
                  onAdd={(name) =>
                    dispatch({ type: "add-area", sectionId: path.sectionId, name })
                  }
                />
              </div>
            </div>
          ) : null}
          {path.view === "area" ? <AreaRound areaId={path.areaId} /> : null}
        </>
      ) : null}
    </div>
  );
}

function Breadcrumb({
  path,
  onGo,
}: {
  path: Path;
  onGo: (p: Path) => void;
}) {
  if (path.view === "home" || path.view === "library" || path.view === "access") return null;
  const { state } = useUx();
  const plant = state.plants.find((p) => p.id === path.plantId);
  const sectionId = path.view === "section" || path.view === "area" ? path.sectionId : undefined;
  const section = sectionId
    ? state.sections.find((s) => s.id === sectionId)
    : undefined;
  const area = path.view === "area" ? state.areas.find((a) => a.id === path.areaId) : undefined;
  const plantId = path.plantId;
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      <button type="button" className="hover:text-foreground" onClick={() => onGo({ view: "home" })}>
        Plants
      </button>
      <ChevronRight className="size-3.5" />
      <button
        type="button"
        className="hover:text-foreground"
        onClick={() => onGo({ view: "plant", plantId })}
      >
        {plant?.name}
      </button>
      {section && sectionId ? (
        <>
          <ChevronRight className="size-3.5" />
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => onGo({ view: "section", plantId, sectionId })}
          >
            {section.name}
          </button>
        </>
      ) : null}
      {area ? (
        <>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{area.name}</span>
        </>
      ) : null}
    </nav>
  );
}

function CardsAccess() {
  const { state } = useUx();
  const [userId, setUserId] = useState(
    state.people.find((p) => p.role === "technician")?.id ?? state.people[0].id
  );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Who covers what</h1>
        <p className="text-sm text-muted-foreground">
          Pick a technician, then tick plant, section, or area. Same rules as the tree.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {state.people
          .filter((p) => p.role === "technician")
          .map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={userId === p.id ? "default" : "outline"}
              onClick={() => setUserId(p.id)}
            >
              {p.name}
            </Button>
          ))}
      </div>
      <CoverageChips userId={userId} />
      <TreeAccess userId={userId} />
    </div>
  );
}
