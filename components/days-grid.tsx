import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DAY_BLURBS, DAY_KEYS } from "@/lib/constants";
import type { Catalogue, DayKey } from "@/lib/types";

export function DaysGrid({ catalogue }: { catalogue: Catalogue }) {
  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Plant sections
        </p>
        <h1 className="font-heading mt-1 text-3xl font-semibold">Weekly electrical PM</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          One section per weekday. Open a day, log the shift, then submit when the round is
          ready. Drafts save themselves.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {DAY_KEYS.map((key: DayKey) => {
          const day = catalogue.days[key];
          const meta = DAY_BLURBS[key];
          const ht = day.equip.filter((e) => e.isHT).length;
          const commonCount = day.common.reduce((n, g) => n + g.items.length, 0);
          return (
            <Link key={key} href={`/log/${key}`} className="block">
              <article className="day-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                    <span className="font-heading text-lg leading-none">
                      {meta.weekday.slice(0, 3)}
                    </span>
                    <span className="mt-1 text-[10px] tracking-wide uppercase opacity-80">
                      {key}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-heading text-xl font-semibold leading-tight">
                        {meta.section}
                      </h2>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">{meta.blurb}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="chip">{day.equip.length} equipment</span>
                      {ht ? <span className="chip">{ht} HT</span> : null}
                      <span className="chip">{commonCount} common</span>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
