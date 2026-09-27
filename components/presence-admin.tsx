"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { formatLocationWindow, type LocationWindow } from "@/lib/location-window";
import { formatSubmitTimestamp } from "@/lib/submit-time";
import type { PresenceSummary } from "@/lib/presence";

type LocationFix = {
  lat: number;
  lng: number;
  accuracy?: number;
  recordedAt: string;
  mapUrl: string;
  slot: string;
};

type PresencePayload = PresenceSummary & {
  window?: LocationWindow;
  windowOpen?: boolean;
  locations?: Record<string, LocationFix>;
};

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours}h ${rest}m`;
}

function LocationLine({ fix }: { fix?: LocationFix }) {
  if (!fix) return null;
  const acc =
    fix.accuracy != null && Number.isFinite(fix.accuracy) ? ` ±${Math.round(fix.accuracy)} m` : "";
  return (
    <p className="mt-1 text-xs">
      <a className="underline" href={fix.mapUrl} target="_blank" rel="noreferrer">
        {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
        {acc}
      </a>
      <span className="text-muted-foreground"> · {formatSubmitTimestamp(fix.recordedAt)}</span>
    </p>
  );
}

function PersonTable({
  rows,
  empty,
  locations,
  windowOpen,
}: {
  rows: PresenceSummary["online"];
  empty: string;
  locations?: Record<string, LocationFix>;
  windowOpen?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div key={`${row.userId}-${row.signedInAt}-m`} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.name}</span>
              {row.online ? <Badge>On app</Badge> : null}
              <Badge variant="outline">{row.role}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{row.username}</p>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Signed in</dt>
                <dd>{formatSubmitTimestamp(row.signedInAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last seen</dt>
                <dd>{formatSubmitTimestamp(row.lastSeenAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Time on app</dt>
                <dd>{formatDuration(row.durationMs)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Location</dt>
                <dd>
                  {windowOpen ? (
                    <LocationLine fix={locations?.[row.userId]} />
                  ) : (
                    <span className="text-muted-foreground">Hidden outside the duty window</span>
                  )}
                  {windowOpen && !locations?.[row.userId] ? (
                    <span className="text-muted-foreground">No check-in in this window yet</span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-2 pr-3 font-medium">Person</th>
            <th className="pb-2 pr-3 font-medium">Signed in</th>
            <th className="pb-2 pr-3 font-medium">Last seen</th>
            <th className="pb-2 pr-3 font-medium">Time on app</th>
            <th className="pb-2 font-medium">Location</th>
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
              <td className="py-2.5 pr-3">
                {windowOpen ? (
                  locations?.[row.userId] ? (
                    <LocationLine fix={locations[row.userId]} />
                  ) : (
                    <span className="text-muted-foreground">No check-in yet</span>
                  )
                ) : (
                  <span className="text-muted-foreground">Hidden</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

export function PresenceAdmin() {
  const [data, setData] = useState<PresencePayload | null>(null);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [enabled, setEnabled] = useState(true);
  const [savingWindow, setSavingWindow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api<PresencePayload>("/api/admin/presence");
      setData(payload);
      if (payload.window) {
        setStart(payload.window.start);
        setEnd(payload.window.end);
        setEnabled(payload.window.enabled);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load presence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void api<PresencePayload>("/api/admin/presence")
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
          Location is recorded only while the app is open, and only inside the duty window.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Location window</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Check-ins are stored and shown only between these plant-local times. Outside the
            window the map stays hidden
            {data?.window ? ` (${formatLocationWindow(data.window)})` : ""}.
            {data?.windowOpen ? " The window is open now." : " The window is closed now."}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Record location during this window
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="loc-start">
                From
              </label>
              <input
                id="loc-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="loc-end">
                Until
              </label>
              <input
                id="loc-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              />
            </div>
          </div>
          <Button
            disabled={savingWindow}
            onClick={() => {
              setSavingWindow(true);
              void api<{ window: LocationWindow }>("/api/admin/location-window", {
                method: "PUT",
                body: JSON.stringify({ start, end, enabled }),
              })
                .then((saved) => {
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          window: saved.window,
                          windowOpen: undefined,
                        }
                      : prev
                  );
                  toast.success("Location window saved.");
                  void load();
                })
                .catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Could not save the window.");
                })
                .finally(() => setSavingWindow(false));
            }}
          >
            {savingWindow ? "Saving…" : "Save window"}
          </Button>
        </CardContent>
      </Card>

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
                locations={data.locations}
                windowOpen={data.windowOpen}
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
                <PersonTable
                  rows={data.today}
                  empty="No sessions today."
                  locations={data.locations}
                  windowOpen={data.windowOpen}
                />
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
                locations={data.locations}
                windowOpen={data.windowOpen}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
