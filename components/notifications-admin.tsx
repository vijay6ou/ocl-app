"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import {
  DEFAULT_NOTIFY_SETTINGS,
  NOTIFY_DEST_KEYS,
  NOTIFY_DEST_LABELS,
  NOTIFY_EVENT_KEYS,
  NOTIFY_EVENT_META,
  type NotifyDestKey,
  type NotifyEventKey,
  type NotifySettings,
} from "@/lib/notify-settings";

type TelegramStatus = {
  configured: boolean;
  linked: boolean;
  botUsername: string;
  lastError?: string;
  lastDiscoverAt?: string;
  lastSentAt?: string;
};

type Channels = {
  discordReports: { configured: boolean };
  discordLocation: { configured: boolean };
  telegram: TelegramStatus;
};

type LastNotify = {
  at?: string;
  date?: string;
  discord?: string;
  telegram?: string;
  warning?: string;
} | null;

function Tick({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function DestCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1.5 py-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-label={label}
      />
      <span className="text-[11px] font-medium text-muted-foreground sm:hidden">{label}</span>
    </label>
  );
}

export function NotificationsAdmin() {
  const [settings, setSettings] = useState<NotifySettings>(DEFAULT_NOTIFY_SETTINGS);
  const [saved, setSaved] = useState<NotifySettings>(DEFAULT_NOTIFY_SETTINGS);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [last, setLast] = useState<LastNotify>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ settings: NotifySettings; channels: Channels; last: LastNotify }>(
        "/api/admin/notifications"
      );
      setSettings(data.settings);
      setSaved(data.settings);
      setChannels(data.channels);
      setLast(data.last);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notification controls.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ settings: NotifySettings; channels: Channels }>("/api/admin/notifications", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });
      setSettings(data.settings);
      setSaved(data.settings);
      setChannels(data.channels);
      toast.success("Routing saved. The next submit or location ping uses this matrix.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save notification controls.");
    } finally {
      setSaving(false);
    }
  }

  async function test(dest: "discord" | "location" | "telegram") {
    setBusy(dest);
    try {
      const data = await api<{ status: string; detail: string; telegram?: TelegramStatus }>(
        "/api/admin/notifications/test",
        { method: "POST", body: JSON.stringify({ dest }) }
      );
      if (data.telegram && channels) {
        setChannels({ ...channels, telegram: data.telegram });
      }
      if (data.status === "ok") toast.success(data.detail);
      else toast.error(data.detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test send failed.");
    } finally {
      setBusy(null);
    }
  }

  async function checkDm() {
    setBusy("telegram-dm");
    try {
      const data = await api<{ telegram: TelegramStatus }>("/api/admin/telegram", {
        method: "POST",
        body: JSON.stringify({ test: false }),
      });
      if (channels) setChannels({ ...channels, telegram: data.telegram });
      toast.success(
        data.telegram.linked
          ? "Private chat is linked."
          : "Still waiting for a DM to @Office3331bot."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check Telegram.");
    } finally {
      setBusy(null);
    }
  }

  function patchDest(event: NotifyEventKey, dest: NotifyDestKey, value: boolean) {
    setSettings((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [event]: {
          ...prev.events[event],
          destinations: { ...prev.events[event].destinations, [dest]: value },
        },
      },
    }));
  }

  function patchOnlyIfFaults(event: NotifyEventKey, value: boolean) {
    setSettings((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [event]: { ...prev.events[event], onlyIfFaults: value },
      },
    }));
  }

  function patchPayload(key: keyof NotifySettings["payload"], value: boolean) {
    setSettings((prev) => ({ ...prev, payload: { ...prev.payload, [key]: value } }));
  }

  function patchWhen(key: keyof NotifySettings["when"], value: boolean) {
    setSettings((prev) => ({ ...prev, when: { ...prev.when, [key]: value } }));
  }

  if (loading) return <LoadingState label="Opening notification controls…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const telegram = channels?.telegram;

  return (
    <div className="space-y-5 pb-24" data-notifications-control>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Control
          </p>
          <h1 className="font-heading text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Each event chooses Discord reports, Discord location, Telegram, or any mix.
            Catalogue and draft saves never notify. Tokens and channel addresses stay on the
            plant server.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save routing" : "Saved"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Discord reports {channels?.discordReports.configured ? "is configured" : "is not configured"}.
            Discord location {channels?.discordLocation.configured ? "is configured" : "is not configured"}.
            Telegram {telegram?.linked ? "is bound" : "is waiting for a DM"}.
          </p>

          <div className="overflow-x-auto rounded-xl border" data-notify-matrix>
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2.5 font-medium">Event</th>
                  {NOTIFY_DEST_KEYS.map((dest) => (
                    <th key={dest} className="px-2 py-2.5 text-center font-medium">
                      {NOTIFY_DEST_LABELS[dest]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFY_EVENT_KEYS.map((event) => {
                  const meta = NOTIFY_EVENT_META[event];
                  const row = settings.events[event];
                  return (
                    <tr key={event} className="border-b last:border-0 align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{meta.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>
                        {event !== "locationCheckIn" ? (
                          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
                            <Checkbox
                              checked={row.onlyIfFaults}
                              onCheckedChange={(value) => patchOnlyIfFaults(event, value === true)}
                            />
                            Only if faults
                          </label>
                        ) : null}
                      </td>
                      {NOTIFY_DEST_KEYS.map((dest) => (
                        <td key={dest} className="px-2 py-3">
                          <DestCheck
                            checked={row.destinations[dest]}
                            onChange={(v) => patchDest(event, dest, v)}
                            label={`${meta.label} → ${NOTIFY_DEST_LABELS[dest]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Tick
            checked={settings.when.submitImmediate}
            onChange={(v) => patchWhen("submitImmediate", v)}
            label="Send immediately on submit"
            hint="Round submit and day notes wait for a successful cloud save."
          />
          <Tick
            checked={settings.when.locationOnSlot}
            onChange={(v) => patchWhen("locationOnSlot", v)}
            label="Location on the 15-minute slot"
            hint="Duty window still applies. Duplicate slots are not posted twice."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Round submit payload</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Tick
            checked={settings.payload.fullForm}
            onChange={(v) => patchPayload("fullForm", v)}
            label="Full form"
            hint="Same layout as the in-app record."
          />
          <Tick
            checked={settings.payload.faultsOnly}
            onChange={(v) => patchPayload("faultsOnly", v)}
            label="Faults only"
          />
          <Tick
            checked={settings.payload.photos}
            onChange={(v) => patchPayload("photos", v)}
            label="Photos"
          />
          <Tick
            checked={settings.payload.pdf}
            onChange={(v) => patchPayload("pdf", v)}
            label="PDF"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location payload</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Tick
            checked={settings.payload.satelliteImage}
            onChange={(v) => patchPayload("satelliteImage", v)}
            label="Satellite image"
            hint="Esri World Imagery snapshot on location check-in."
          />
          <Tick
            checked={settings.payload.coords}
            onChange={(v) => patchPayload("coords", v)}
            label="Coordinates"
          />
          <Tick
            checked={settings.payload.name}
            onChange={(v) => patchPayload("name", v)}
            label="Name"
          />
          <Tick
            checked={settings.payload.time}
            onChange={(v) => patchPayload("time", v)}
            label="Time"
          />
        </CardContent>
      </Card>

      <Card data-telegram-status>
        <CardHeader>
          <CardTitle>Telegram status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {telegram ? (
            <>
              <p>
                Bot <span className="font-medium">@{telegram.botUsername || "Office3331bot"}</span>
                {telegram.configured ? " is configured." : " is not configured on the plant server."}{" "}
                {telegram.linked
                  ? "A private chat is bound."
                  : "Waiting for a private message to @Office3331bot."}
              </p>
              {telegram.lastError ? <p className="text-amber-800">{telegram.lastError}</p> : null}
              {telegram.lastSentAt ? (
                <p className="text-muted-foreground">
                  Last send {telegram.lastSentAt.slice(0, 16).replace("T", " ")} UTC
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Could not read Telegram status.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void checkDm()}>
              {busy === "telegram-dm" ? "Checking…" : "Check for a DM"}
            </Button>
            <Button
              type="button"
              disabled={busy !== null || !telegram?.linked}
              onClick={() => void test("telegram")}
            >
              {busy === "telegram" ? "Sending…" : "Send Telegram test"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test send</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Posts a short control-page test to that destination. Real events still follow the matrix.
            No token, webhook, or server address is included.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void test("discord")}>
              {busy === "discord" ? "Sending…" : "Test reports channel"}
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void test("location")}>
              {busy === "location" ? "Sending…" : "Test location channel"}
            </Button>
          </div>
          {last?.at ? (
            <p className="text-muted-foreground">
              Last round notify {last.at.slice(0, 16).replace("T", " ")} UTC · Discord {last.discord ?? "—"} ·
              Telegram {last.telegram ?? "—"}
              {last.date ? ` · ${last.date}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(13,33,55,0.08)] backdrop-blur md:hidden">
        <Button className="w-full" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save routing" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
