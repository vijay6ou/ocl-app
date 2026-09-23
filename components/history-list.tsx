"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { DAY_KEYS } from "@/lib/constants";
import { defaultHistoryRange, formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";
import { SHIFT_OPTIONS, type DayKey, type FailItem, type SubmissionMeta, type SubmissionStatus } from "@/lib/types";

type Row = {
  id: string;
  savedAt: string;
  submittedAt?: string;
  status: SubmissionStatus;
  meta: SubmissionMeta;
  failCount: number;
  fails: FailItem[];
};

export function HistoryList() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [day, setDay] = useState(searchParams.get("day") ?? "");
  const [shift, setShift] = useState(searchParams.get("shift") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? defaultHistoryRange().from);
  const [to, setTo] = useState(searchParams.get("to") ?? defaultHistoryRange().to);
  const [failures, setFailures] = useState(searchParams.get("failures") === "1");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (day) params.set("day", day);
      if (shift) params.set("shift", shift);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (failures) params.set("failures", "1");
      const data = await api<{ submissions: Row[] }>(`/api/submissions?${params}`);
      setRows(data.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read records from the server.");
    } finally {
      setLoading(false);
    }
  }, [q, day, shift, from, to, failures]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Cloud records</h1>
        <p className="text-sm text-muted-foreground">
          Search and open saved cloud records from the last 30 days. Technicians and admin
          see the same archive.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          placeholder="Search remarks, equipment, technician…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="lg:col-span-2"
        />
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        >
          <option value="">All sections</option>
          {DAY_KEYS.map((k: DayKey) => (
            <option key={k} value={k}>
              {k.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={shift}
          onChange={(e) => setShift(e.target.value)}
        >
          <option value="">All shifts</option>
          {SHIFT_OPTIONS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <label className="flex items-center gap-2 text-sm lg:col-span-6">
          <input
            type="checkbox"
            checked={failures}
            onChange={(e) => setFailures(e.target.checked)}
          />
          Failures only
        </label>
      </div>

      {loading ? <LoadingState label="Reading archive from the plant server…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows && rows.length === 0 ? (
        <EmptyState
          title={q || day || shift || from || to || failures ? "No matching records" : "No checklists yet"}
          message={
            q || day || shift || from || to || failures
              ? "Nothing on the server matches these filters. Clear a filter or try another date."
              : "Finish a Monday–Saturday round and submit it. Archived reports appear here for every signed-in technician."
          }
        />
      ) : null}

      <div className="space-y-2">
        {rows?.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/history/${row.id}`} className="font-medium hover:underline">
                  {row.meta.form}
                </Link>
                <Badge variant={row.status === "COMPLETE" ? "secondary" : "outline"}>
                  {row.status}
                </Badge>
                {row.failCount > 0 ? (
                  <Badge variant="destructive">{row.failCount} defects</Badge>
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
    </div>
  );
}
