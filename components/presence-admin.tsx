"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { formatSubmitTimestamp } from "@/lib/submit-time";
import type { PresenceSummary } from "@/lib/presence";

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours}h ${rest}m`;
}

function PersonTable({
  rows,
  empty,
}: {
  rows: PresenceSummary["online"];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-2 pr-3 font-medium">Person</th>
            <th className="pb-2 pr-3 font-medium">Signed in</th>
            <th className="pb-2 pr-3 font-medium">Last seen</th>
            <th className="pb-2 font-medium">Time on app</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.userId}-${row.signedInAt}`} className="border-t">
              <td className="py-2.5 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  {row.online ? <Badge>On app</Badge> : null}
                  <Badge variant="outline">{row.role}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{row.username}</div>
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                {formatSubmitTimestamp(row.signedInAt)}
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                {formatSubmitTimestamp(row.lastSeenAt)}
              </td>
              <td className="py-2.5 whitespace-nowrap">{formatDuration(row.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PresenceAdmin() {
  const [data, setData] = useState<PresenceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<PresenceSummary>("/api/admin/presence"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load presence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void api<PresenceSummary>("/api/admin/presence")
        .then(setData)
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Presence</h1>
        <p className="text-sm text-muted-foreground">
          Who is on the app now, when they signed in, and how long they have been using it today.
          Heartbeats stop when the app is closed. Host and notify details are not shown.
        </p>
      </div>

      {loading && !data ? <LoadingState label="Loading who is on the app…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  On the app now
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-semibold tabular-nums">
                  {data.onlineCount}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.onlineCount === 1 ? "person" : "people"} with the log open in the last
                  two minutes.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Signed in today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-semibold tabular-nums">
                  {data.today.length}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plant date · time spent is summed across sessions.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Who is here</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonTable
                rows={data.online}
                empty="Nobody has the app open right now."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
            </CardHeader>
            <CardContent>
              {data.today.length === 0 ? (
                <EmptyState
                  title="No one yet today"
                  message="Time on the app is recorded while a signed-in session stays open."
                />
              ) : (
                <PersonTable rows={data.today} empty="No sessions today." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonTable
                rows={data.recent}
                empty="No sessions recorded yet."
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
