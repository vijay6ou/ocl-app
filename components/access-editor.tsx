"use client";

import { coverageOfArea, hasExactGrant, toggleGrant } from "@/lib/hierarchy";
import type { AccessGrant, Catalogue, PublicUser } from "@/lib/types";

export function AccessEditor({
  catalogue,
  person,
  onChange,
}: {
  catalogue: Catalogue;
  person: PublicUser;
  onChange: (grants: AccessGrant[]) => void;
}) {
  if (person.role === "admin") {
    return <p className="text-sm text-muted-foreground">Admins see every plant.</p>;
  }
  const grants = person.grants ?? [];

  function flip(kind: AccessGrant["kind"], targetId: string) {
    onChange(toggleGrant(grants, { kind, targetId }));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tick a plant, a section, or a single area. A higher tick covers everything under it.
      </p>
      {catalogue.plants.map((plant) => {
        const plantOn = hasExactGrant({ ...person, grants }, "plant", plant.id);
        return (
          <div key={plant.id} className="rounded-xl bg-muted/40 p-3">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={plantOn}
                onChange={() => flip("plant", plant.id)}
              />
              Whole plant · {plant.name}
            </label>
            {catalogue.sections
              .filter((s) => s.plantId === plant.id)
              .map((section) => {
                const secOn = hasExactGrant({ ...person, grants }, "section", section.id);
                return (
                  <div key={section.id} className="mt-2 ml-5">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={secOn}
                        disabled={plantOn}
                        onChange={() => flip("section", section.id)}
                      />
                      Whole section · {section.name}
                      {plantOn ? (
                        <span className="text-xs text-muted-foreground">(from plant)</span>
                      ) : null}
                    </label>
                    <div className="mt-1 ml-5 flex flex-col gap-1">
                      {section.areaIds.map((areaId) => {
                        const area = catalogue.days[areaId];
                        const cover = coverageOfArea(
                          { ...person, grants },
                          catalogue,
                          areaId
                        );
                        return (
                          <label key={areaId} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={cover !== "none"}
                              disabled={cover === "plant" || cover === "section"}
                              onChange={() => flip("area", areaId)}
                            />
                            {area?.label ?? areaId}
                            {cover === "plant" || cover === "section" ? (
                              <span className="text-xs text-muted-foreground">(from {cover})</span>
                            ) : cover === "area" ? (
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
