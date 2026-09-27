import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Catalogue } from "@/lib/types";
import { sectionsOfPlant } from "@/lib/hierarchy";

export function DaysGrid({ catalogue }: { catalogue: Catalogue }) {
  return (
    <div className="space-y-8">
      {catalogue.plants.map((plant) => (
        <section key={plant.id} className="space-y-4">
          <h2 className="font-heading text-xl font-semibold">{plant.name}</h2>
          {sectionsOfPlant(catalogue, plant.id).map((section) => (
            <div key={section.id} className="space-y-2">
              <h3 className="font-heading text-lg">{section.name}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.areaIds.map((id) => {
                  const day = catalogue.days[id];
                  if (!day) return null;
                  return (
                    <Link key={id} href={`/log/${id}`} className="block">
                      <article className="day-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                            <span className="font-heading text-sm">{day.badge || day.label.slice(0, 3)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-heading text-xl font-semibold">{day.label}</h3>
                              <ChevronRight className="mt-1 size-4 text-muted-foreground" />
                            </div>
                            <span className="chip mt-2 inline-flex">
                              {day.equip.length === 0 ? "No equipment yet" : `${day.equip.length} equipment`}
                            </span>
                          </div>
                        </div>
                      </article>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
