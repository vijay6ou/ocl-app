"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/states";
import { PrintReport } from "@/components/print-report";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { printReport } from "@/lib/print-native";
import type { Submission } from "@/lib/types";
import { formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";

export function RecordView({ id, initial }: { id: string; initial?: Submission }) {
  const { user } = useAuth();
  const router = useRouter();
  const [record, setRecord] = useState<Submission | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ submission: Submission }>(`/api/submissions/${id}`);
      setRecord(data.submission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Record could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (initial) return;
    void load();
  }, [load, initial]);

  async function remove() {
    if (!confirm("Delete this archived checklist from the plant server?")) return;
    try {
      await api(`/api/submissions/${id}`, { method: "DELETE" });
      toast.success("Record deleted.");
      router.push("/history");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  if (loading) return <LoadingState label="Opening archived checklist…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!record) return <ErrorState message="Record not found." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{record.meta.form}</h1>
          <p className="text-sm text-muted-foreground">
            {record.meta.date} · {record.meta.shiftLabel} · {record.meta.tech} · {record.id}
          </p>
          <p className="text-sm text-muted-foreground">
            Submitted {formatSubmitTimestamp(submitInstant(record))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={record.status === "COMPLETE" ? "secondary" : "outline"}>
            {record.status}
          </Badge>
          <Button variant="outline" onClick={() => printReport()}>
            Print / PDF
          </Button>
          {user?.role === "admin" ? (
            <Button variant="destructive" onClick={() => void remove()}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      <PrintReport record={record} />
    </div>
  );
}
