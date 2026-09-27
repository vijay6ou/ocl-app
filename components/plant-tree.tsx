"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Factory, Layers, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import {
  canSeeArea,
  canSeePlant,
  canSeeSection,
  sectionsOfPlant,
} from "@/lib/hierarchy";
import type { Catalogue, PublicUser } from "@/lib/types";

function NameAdd({
  placeholder,
  label,
  onAdd,
}: {
  placeholder: string;
  label: string;
  onAdd: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void onAdd(name.trim());
        setName("");
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className="h-7 text-xs" />
      <Button type="submit" size="xs">
        {label}
      </Button>
    </form>
  );
}

export function PlantTree({
  catalogue,
  user,
  mode,
  onCatalogue,
}: {
  catalogue: Catalogue;
  user: PublicUser;
  mode: "log" | "admin";
  onCatalogue?: (next: Catalogue) => void;
}) {
  const router = useRouter();
  const admin = user.role === "admin" && mode === "admin";
  const [openPlants, setOpenPlants] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(catalogue.plants.map((p) => [p.id, true]))
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(catalogue.sections.map((s) => [s.id, true]))
  );
  const [copyArea, setCopyArea] = useState<string | null>(null);
  const [copySection, setCopySection] = useState<string | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyOnto, setCopyOnto] = useState("");

  async function structure(body: Record<string, string>) {
    try {
      const data = await api<{ catalogue: Catalogue }>("/api/structure", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCatalogue?.(data.catalogue);
      toast.success("Plant structure updated.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the plant.");
      return false;
    }
  }

  function openArea(id: string) {
    if (mode === "admin") router.push(`/admin/catalogue/${id}`);
    else router.push(`/log/${id}`);
  }

  const plants = catalogue.plants.filter((p) => canSeePlant(user, catalogue, p.id));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-0 md:flex-row">
      <aside className="border-b border-border bg-[oklch(0.32_0.06_155)] text-white md:min-h-[70vh] md:w-80 md:border-b-0 md:border-r md:border-white/10">
        <div className="px-3 py-3">
          <p className="text-[11px] tracking-[0.14em] text-white/60 uppercase">Plant tree</p>
          <p className="font-heading text-lg">Locations</p>
        </div>
        <nav className="max-h-[50vh] overflow-y-auto px-2 pb-3 md:max-h-none">
          {plants.length === 0 ? (
            <p className="px-2 text-sm text-white/70">
              No locations assigned. Ask an admin to give you a plant, section, or area.
            </p>
          ) : null}
          {plants.map((plant) => {
            const plantOpen = openPlants[plant.id] ?? true;
            const sections = sectionsOfPlant(catalogue, plant.id).filter((s) =>
              canSeeSection(user, catalogue, s.id)
            );
            return (
              <div key={plant.id} className="mb-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-white/10"
                    onClick={() => setOpenPlants((o) => ({ ...o, [plant.id]: !plantOpen }))}
                  >
                    {plantOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                  <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm">
                    <Factory className="size-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{plant.name}</span>
                  </span>
                </div>
                {plantOpen
                  ? sections.map((section) => {
                      const secOpen = openSections[section.id] ?? true;
                      const areas = section.areaIds.filter((id) => canSeeArea(user, catalogue, id));
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
                            <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-sm">
                              <Layers className="size-3.5 shrink-0 opacity-80" />
                              <span className="truncate">{section.name}</span>
                            </span>
                            {admin ? (
                              <button
                                type="button"
                                className="shrink-0 rounded px-1.5 py-1 text-[10px] uppercase tracking-wide text-white/70 hover:bg-white/10 hover:text-white"
                                onClick={() => {
                                  setCopyArea(null);
                                  setCopySection(section.id);
                                  setCopyName("");
                                }}
                              >
                                Copy
                              </button>
                            ) : null}
                          </div>
                          {secOpen
                            ? areas.map((id) => {
                                const area = catalogue.days[id];
                                if (!area) return null;
                                const n = area.equip.length;
                                return (
                                  <div key={id} className="ml-7">
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => openArea(id)}
                                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-white/10"
                                      >
                                        <MapPin className="size-3.5 shrink-0 opacity-80" />
                                        <span className="min-w-0 truncate">{area.label}</span>
                                        <span className="ml-auto text-[10px] text-white/50">
                                          {n === 0 ? "empty" : n}
                                        </span>
                                      </button>
                                      {admin ? (
                                        <button
                                          type="button"
                                          className="shrink-0 rounded px-1.5 py-1 text-[10px] uppercase tracking-wide text-white/70 hover:bg-white/10 hover:text-white"
                                          onClick={() => {
                                            setCopySection(null);
                                            setCopyArea(id);
                                            setCopyName("");
                                            setCopyOnto("");
                                          }}
                                        >
                                          Copy
                                        </button>
                                      ) : null}
                                    </div>
                                    {admin && copyArea === id ? (
                                      <div className="mt-1 mb-2 space-y-1.5 rounded-lg bg-white p-2 text-foreground">
                                        <p className="text-[11px] text-muted-foreground">
                                          Duplicate this area, or replace another area’s form with this one.
                                        </p>
                                        <div className="flex gap-1">
                                          <Input
                                            value={copyName}
                                            onChange={(e) => setCopyName(e.target.value)}
                                            placeholder="Cement mill 2"
                                            className="h-7 text-xs"
                                          />
                                          <Button
                                            type="button"
                                            size="xs"
                                            disabled={!copyName.trim()}
                                            onClick={() => {
                                              void structure({
                                                action: "duplicate-area",
                                                fromId: id,
                                                sectionId: section.id,
                                                name: copyName.trim(),
                                              }).then(() => {
                                                setCopyArea(null);
                                                setCopyName("");
                                              });
                                            }}
                                          >
                                            Duplicate
                                          </Button>
                                        </div>
                                        <div className="flex gap-1">
                                          <select
                                            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs"
                                            value={copyOnto}
                                            onChange={(e) => setCopyOnto(e.target.value)}
                                          >
                                            <option value="">Copy onto…</option>
                                            {Object.entries(catalogue.days)
                                              .filter(([otherId]) => otherId !== id)
                                              .map(([otherId, other]) => (
                                                <option key={otherId} value={otherId}>
                                                  {other.label}
                                                </option>
                                              ))}
                                          </select>
                                          <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            disabled={!copyOnto}
                                            onClick={() => {
                                              void structure({
                                                action: "copy-area",
                                                fromId: id,
                                                toId: copyOnto,
                                              }).then(() => {
                                                setCopyArea(null);
                                                setCopyOnto("");
                                              });
                                            }}
                                          >
                                            Onto
                                          </Button>
                                        </div>
                                        <button
                                          type="button"
                                          className="text-[11px] text-muted-foreground"
                                          onClick={() => setCopyArea(null)}
                                        >
                                          Close
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            : null}
                          {admin && copySection === section.id ? (
                            <div className="ml-10 mt-1 mb-2 space-y-1.5 rounded-lg bg-white p-2 text-foreground">
                              <p className="text-[11px] text-muted-foreground">
                                Duplicate this whole section (every area and its motors) with a new name.
                              </p>
                              <div className="flex gap-1">
                                <Input
                                  value={copyName}
                                  onChange={(e) => setCopyName(e.target.value)}
                                  placeholder="Cement mill 2"
                                  className="h-7 text-xs"
                                />
                                <Button
                                  type="button"
                                  size="xs"
                                  disabled={!copyName.trim()}
                                  onClick={() => {
                                    void structure({
                                      action: "duplicate-section",
                                      fromId: section.id,
                                      name: copyName.trim(),
                                    }).then(() => {
                                      setCopySection(null);
                                      setCopyName("");
                                    });
                                  }}
                                >
                                  Duplicate
                                </Button>
                              </div>
                              <button
                                type="button"
                                className="text-[11px] text-muted-foreground"
                                onClick={() => setCopySection(null)}
                              >
                                Close
                              </button>
                            </div>
                          ) : null}
                          {admin && secOpen ? (
                            <div className="ml-10 mt-1 mb-2 rounded-lg bg-white p-1.5 text-foreground">
                              <NameAdd
                                placeholder="New area"
                                label="Add"
                                onAdd={(name) => void structure({ action: "add-area", sectionId: section.id, name })}
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
                      label="Add"
                      onAdd={(name) => void structure({ action: "add-section", plantId: plant.id, name })}
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
                  placeholder="New plant"
                  label="Add"
                  onAdd={(name) => void structure({ action: "add-plant", name })}
                />
              </div>
            </div>
          ) : null}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          {mode === "admin" ? "Plant structure" : "Your round"}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          {mode === "admin" ? "Plants, sections, and areas" : "Weekly electrical PM"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {mode === "admin"
            ? "Add empty plants and sections when you need them. Open an area to edit its equipment. Copy Cement mill 1 onto Cement mill 2, or drop a super block (a stacker with five motors) from the block library."
            : "Open an area in the tree. You only see the plants, sections, and areas assigned to you."}
        </p>
        {mode === "admin" ? (
          <p className="mt-4 text-sm">
            <Link href="/admin/blocks" className="text-primary underline-offset-2 hover:underline">
              Open equipment block library
            </Link>
          </p>
        ) : null}
        {mode === "log" && plants.length > 0 ? (
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {plants.flatMap((plant) =>
              sectionsOfPlant(catalogue, plant.id)
                .filter((s) => canSeeSection(user, catalogue, s.id))
                .flatMap((section) =>
                  section.areaIds
                    .filter((id) => canSeeArea(user, catalogue, id))
                    .map((id) => {
                      const area = catalogue.days[id];
                      if (!area) return null;
                      return (
                        <li key={id}>
                          <Link href={`/log/${id}`} className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                            <p className="text-xs text-muted-foreground">
                              {plant.name} · {section.name}
                            </p>
                            <p className="font-heading text-lg">{area.label}</p>
                          </Link>
                        </li>
                      );
                    })
                )
            )}
          </ul>
        ) : null}
      </main>
    </div>
  );
}