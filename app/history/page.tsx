import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states";
import { getCurrentUser } from "@/lib/auth";
import { listSubmissions } from "@/lib/store";
import { DAY_KEYS } from "@/lib/constants";
import { SHIFT_OPTIONS, type DayKey } from "@/lib/types";
import { defaultHistoryRange, formatSubmitTimestamp, recordInDateRange, submitInstant } from "@/lib/submit-time";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const day = String(sp.day ?? "");
  const shift = String(sp.shift ?? "");
  const range = defaultHistoryRange();
  const from = String(sp.from ?? range.from);
  const to = String(sp.to ?? range.to);
  const failures = sp.failures === "1" || sp.failures === "on";

  let rows = await listSubmissions();
  rows = rows.filter((r) => recordInDateRange(r, from, to));
  if (day) rows = rows.filter((r) => r.meta.day === day);
  if (shift) rows = rows.filter((r) => r.meta.shift === shift);
  if (failures) rows = rows.filter((r) => r.fails.length > 0);
  if (q) {
    rows = rows.filter((r) =>
      [
        r.meta.tech,
        r.meta.sup,
        r.meta.dayLabel,
        r.meta.form,
        r.id,
        ...r.fails.map((f) => `${f.equipment} ${f.issue}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Cloud records</h1>
        <p className="text-sm text-muted-foreground">
          Search and open saved cloud records from the last 30 days. Technicians and admin see
          the same archive. Open a row to reprint or save PDF.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input
          name="q"
          defaultValue={String(sp.q ?? "")}
          placeholder="Search remarks, equipment, technician…"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm lg:col-span-2"
        />
        <select
          name="day"
          defaultValue={day}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="">All sections</option>
          {DAY_KEYS.map((k: DayKey) => (
            <option key={k} value={k}>
              {k.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          name="shift"
          defaultValue={shift}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="">All shifts</option>
          {SHIFT_OPTIONS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm lg:col-span-5">
          <input type="checkbox" name="failures" value="1" defaultChecked={failures} />
          Failures only
        </label>
        <Button type="submit" className="lg:col-span-1">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={q || day || shift || from || to || failures ? "No matching records" : "No checklists yet"}
          message={
            q || day || shift || from || to || failures
              ? "Nothing on the server matches these filters. Clear a filter or try another date."
              : "Finish a Monday–Saturday round and submit it. Archived reports appear here for every signed-in technician."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/history/${row.id}`} className="font-medium hover:underline">
                    {row.meta.form}
                  </Link>
                  <Badge variant={row.status === "COMPLETE" ? "secondary" : "outline"}>
                    {row.status}
                  </Badge>
                  {row.fails.length > 0 ? (
                    <Badge variant="destructive">{row.fails.length} defects</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.meta.date} · {row.meta.shiftLabel} · {row.meta.tech}
                  {row.meta.sup ? ` · Sup. ${row.meta.sup}` : ""} · {row.meta.pct}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Submitted {formatSubmitTimestamp(submitInstant(row))}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" render={<Link href={`/history/${row.id}`} />}>
                  Open
                </Button>
                <Button variant="outline" size="sm" render={<Link href={`/print/${row.id}`} />}>
                  <Printer />
                  Print
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
