import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Catalogue } from "@/lib/types";

export function DaysGrid({ catalogue }: { catalogue: Catalogue }) {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Plant areas
        </p>
        <h1 className="font-heading mt-1 text-3xl font-semibold">Weekly electrical PM</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Material handling is one area of the plant, with a subsection for each weekday. Raw
          mill, kiln, cement mill, and the power plant have their own subsections. Open the
          subsection for this round. Drafts save themselves.
        </p>
      </div>
      {catalogue.areas.map((area) => (
        <section key={area.id} className="space-y-3">
          <div className="max-w-2xl">
            <h2 className="font-heading text-xl font-semibold">{area.name}</h2>
            {area.blurb ? (
              <p className="text-sm text-muted-foreground">{area.blurb}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {area.sectionIds.map((key) => {
              const day = catalogue.days[key];
              if (!day) return null;
              const ht = day.equip.filter((e) => e.isHT).length;
              const commonCount = day.common.reduce((n, g) => n + g.items.length, 0);
              return (
                <Link key={key} href={`/log/${key}`} className="block">
                  <article className="day-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                        <span className="font-heading text-center text-sm leading-tight">
                          {day.badge || area.name.slice(0, 3)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-heading text-xl font-semibold leading-tight">
                            {day.label}
                          </h3>
                          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                        </div>
                        {day.blurb ? (
                          <p className="mt-1 text-sm leading-snug text-muted-foreground">{day.blurb}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="chip">
                            {day.equip.length === 0 ? "No equipment yet" : `${day.equip.length} equipment`}
                          </span>
                          {ht ? <span className="chip">{ht} HT</span> : null}
                          {commonCount ? <span className="chip">{commonCount} common</span> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
