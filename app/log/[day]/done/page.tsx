"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import type { Submission } from "@/lib/types";

export default function DonePage() {
  return (
    <Suspense fallback={<LoadingState label="Opening submitted round…" />}>
      <DoneInner />
    </Suspense>
  );
}

function DoneInner() {
  const search = useSearchParams();
  const id = search.get("id");
  const [record, setRecord] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError("No archived record id was provided.");
      setLoading(false);
      return;
    }
    api<{ submission: Submission }>(`/api/submissions/${id}`)
      .then((data) => setRecord(data.submission))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load the archived round.")
      )
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      {loading ? <LoadingState label="Confirming archive on the server…" /> : null}
      {error ? <ErrorState message={error} /> : null}
      {record ? (
        <Card className="overflow-hidden shadow-sm">
          <CardHeader>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
              Archived
            </p>
            <CardTitle className="text-2xl">Checklist archived</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {record.meta.form} for {record.meta.date}, {record.meta.shiftLabel}, is stored on
              the plant server as {record.id}. Technician on the report: {record.meta.tech}.
            </p>
            <p className="text-sm text-muted-foreground">
              Completion {record.meta.pct}% · {record.status}
              {record.fails.length
                ? ` · ${record.fails.length} defect${record.fails.length === 1 ? "" : "s"}`
                : " · no FAIL items"}
            </p>
            {record.fails.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {record.fails.map((f, i) => (
                  <li key={i}>
                    {f.equipment}: {f.issue}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href={`/print/${record.id}`} />}>Print / save PDF</Button>
              <Button variant="outline" render={<Link href={`/history/${record.id}`} />}>
                Open record
              </Button>
              <Button variant="outline" render={<Link href="/days" />}>
                Back to days
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
