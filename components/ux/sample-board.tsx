"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  assignedAreas,
  coverageOfArea,
  hasGrant,
  isAdmin,
  pathForArea,
  placedInArea,
  usesOfBlock,
} from "@/lib/ux-mock";
import { AreaRound, BlockLibrary, NameAdd } from "@/components/ux/shared";
import { useUx } from "@/components/ux/store";

export function SampleBoard() {
  const { state } = useUx();
  const admin = isAdmin(state);
  const [tab, setTab] = useState<"board" | "library" | "round">("board");
  const [areaId, setAreaId] = useState("area-additive");
  const [plantId, setPlantId] = useState(state.plants[0]?.id ?? "");

  if (!admin) {
    const areas = assignedAreas(state);
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <h1 className="font-heading text-3xl font-semibold">Today’s list</h1>
        <p className="text-sm text-muted-foreground">
          Areas you cover, grouped by section. Open one to fill the round.
        </p>
        {tab === "round" ? (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTab("board")}>
              ← Back to list
            </Button>
            <AreaRound areaId={areaId} />
          </div>
        ) : (
          <ol className="space-y-2">
            {areas.map((area) => {
              const trail = pathForArea(state, area.id);
              return (
                <li key={area.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAreaId(area.id);
                      setTab("round");
                    }}
                    className="flex w-full items-center justify-between rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10"
                  >
                    <span>
                      <span className="block font-heading text-lg">{area.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {trail.plant} · {trail.section}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {placedInArea(state, area.id).length} equipment
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Coverage board
          </p>
          <h1 className="font-heading text-3xl font-semibold">Who is where</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            People down the side, areas across the top. A filled cell is access. Use the section
            header to give a whole section, or the plant chip for the whole plant.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "board" ? "default" : "outline"}
            onClick={() => setTab("board")}
          >
            Board
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "library" ? "default" : "outline"}
            onClick={() => setTab("library")}
          >
            Block library
          </Button>
        </div>
      </div>
      {tab === "library" ? (
        <div className="mx-auto max-w-3xl">
          <BlockLibrary canEdit />
        </div>
      ) : null}
      {tab === "board" ? (
        <BoardGrid
          plantId={plantId}
          onPlant={setPlantId}
          onOpenArea={(id) => {
            setAreaId(id);
            setTab("round");
          }}
        />
      ) : null}
      {tab === "round" ? (
        <div className="mx-auto max-w-3xl rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <Button type="button" variant="ghost" size="sm" onClick={() => setTab("board")}>
            ← Back to board
          </Button>
          <AreaRound areaId={areaId} />
        </div>
      ) : null}
    </div>
  );
}

function BoardGrid({
  plantId,
  onPlant,
  onOpenArea,
}: {
  plantId: string;
  onPlant: (id: string) => void;
  onOpenArea: (areaId: string) => void;
}) {
  const { state, dispatch } = useUx();
  const plant = state.plants.find((p) => p.id === plantId);
  const sections = state.sections.filter((s) => s.plantId === plantId);
  const techs = state.people.filter((p) => p.role === "technician");
  const areaCols = useMemo(
    () =>
      sections.flatMap((section) =>
        state.areas
          .filter((a) => a.sectionId === section.id)
          .map((area) => ({ section, area }))
      ),
    [sections, state.areas]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {state.plants.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPlant(p.id)}
            className={`rounded-full px-3 py-1 text-sm ${
              p.id === plantId ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {p.name}
          </button>
        ))}
        <div className="max-w-xs">
          <NameAdd
            placeholder="New plant"
            label="Add"
            onAdd={(name) => dispatch({ type: "add-plant", name })}
          />
        </div>
      </div>
      {!plant ? (
        <p className="text-sm text-muted-foreground">Select a plant.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[oklch(0.32_0.06_155)] text-white">
                <th className="sticky left-0 z-10 bg-[oklch(0.32_0.06_155)] px-3 py-2 text-left font-heading">
                  Technician
                </th>
                {sections.map((section) => {
                  const cols = state.areas.filter((a) => a.sectionId === section.id).length;
                  return (
                    <th
                      key={section.id}
                      colSpan={Math.max(cols, 1)}
                      className="border-l border-white/20 px-2 py-2 text-center font-medium"
                    >
                      {section.name}
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-muted">
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left text-xs font-normal">
                  {plant.name}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Click a name to give the whole plant. Click a section title in the next row
                    of cells.
                  </div>
                </th>
                {areaCols.map(({ area }) => (
                  <th key={area.id} className="min-w-[5.5rem] px-1 py-2 text-center text-xs font-medium">
                    <button type="button" className="hover:underline" onClick={() => onOpenArea(area.id)}>
                      {area.name}
                    </button>
                  </th>
                ))}
                {areaCols.length === 0 ? (
                  <th className="px-3 py-2 text-xs font-normal text-muted-foreground">
                    No areas
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {techs.map((tech) => {
                const plantOn = hasGrant(state, tech.id, "plant", plant.id);
                return (
                  <tr key={tech.id} className="border-t border-border">
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "toggle-grant",
                            userId: tech.id,
                            kind: "plant",
                            targetId: plant.id,
                          })
                        }
                        className="text-left"
                        title="Toggle whole plant"
                      >
                        {tech.name}
                        {plantOn ? (
                          <span className="mt-0.5 block text-[10px] font-normal text-primary">
                            whole plant
                          </span>
                        ) : null}
                      </button>
                    </th>
                    {areaCols.map(({ section, area }) => {
                      const cover = coverageOfArea(state, tech.id, area.id);
                      const exact = hasGrant(state, tech.id, "area", area.id);
                      const inherited = cover === "plant" || cover === "section";
                      return (
                        <td key={area.id} className="border-l border-border p-1 text-center">
                          <button
                            type="button"
                            disabled={inherited}
                            title={
                              inherited
                                ? `Covered by ${cover}. Remove that grant first.`
                                : exact
                                  ? "Remove this area"
                                  : "Give this area"
                            }
                            onClick={() =>
                              dispatch({
                                type: "toggle-grant",
                                userId: tech.id,
                                kind: "area",
                                targetId: area.id,
                              })
                            }
                            className={`h-9 w-full rounded-md text-xs ${
                              cover === "none"
                                ? "bg-muted/40 text-muted-foreground"
                                : cover === "area"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-primary/30 text-primary"
                            }`}
                          >
                            {cover === "none" ? "—" : cover === "area" ? "area" : cover}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/80 px-3 py-2 text-left text-xs font-normal">
                  Whole section
                </th>
                {sections.map((section) => {
                  const cols = Math.max(
                    state.areas.filter((a) => a.sectionId === section.id).length,
                    1
                  );
                  return (
                    <td key={section.id} colSpan={cols} className="border-l border-border p-1">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {techs.map((tech) => {
                          const on = hasGrant(state, tech.id, "section", section.id);
                          const plantOn = hasGrant(state, tech.id, "plant", plant.id);
                          return (
                            <button
                              key={tech.id}
                              type="button"
                              disabled={plantOn}
                              onClick={() =>
                                dispatch({
                                  type: "toggle-grant",
                                  userId: tech.id,
                                  kind: "section",
                                  targetId: section.id,
                                })
                              }
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                on || plantOn
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background ring-1 ring-border"
                              }`}
                            >
                              {tech.name.split(" ")[0]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <p className="font-heading text-lg">Add under this plant</p>
          {plant ? (
            <div className="mt-2 space-y-2">
              <NameAdd
                placeholder="New section"
                label="Add section"
                onAdd={(name) => dispatch({ type: "add-section", plantId: plant.id, name })}
              />
              {sections[0] ? (
                <NameAdd
                  placeholder={`New area in ${sections[0].name}`}
                  label="Add area"
                  onAdd={(name) =>
                    dispatch({ type: "add-area", sectionId: sections[0].id, name })
                  }
                />
              ) : (
                <p className="text-xs text-muted-foreground">Add a section first.</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <p className="font-heading text-lg">Library in use</p>
          <ul className="mt-2 space-y-1 text-sm">
            {state.blocks.map((b) => {
              const n = usesOfBlock(state, b.id).length;
              if (!n) return null;
              return (
                <li key={b.id}>
                  {b.title} · {n} card{n === 1 ? "" : "s"}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
