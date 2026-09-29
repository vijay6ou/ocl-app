"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { DEFAULT_NOTIFY_SETTINGS, type NotifySettings } from "@/lib/notify-settings";

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
      toast.success("Notification controls saved. The next submit or location ping uses them.");
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

  function patch<K extends keyof NotifySettings>(group: K, key: keyof NotifySettings[K], value: boolean) {
    setSettings((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
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
            What Discord and Telegram send, and when. Catalogue and draft saves never notify.
            Location stays on the location channel — not Telegram. Tokens and channel addresses
            stay on the plant server.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save controls" : "Saved"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Destinations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Tick
            checked={settings.destinations.discordReports}
            onChange={(v) => patch("destinations", "discordReports", v)}
            label="Discord reports"
            hint={
              channels?.discordReports.configured
                ? "Round submit channel is configured."
                : "Channel is not configured on the plant server."
            }
          />
          <Tick
            checked={settings.destinations.discordLocation}
            onChange={(v) => patch("destinations", "discordLocation", v)}
            label="Discord location"
            hint={
              channels?.discordLocation.configured
                ? "15-minute check-in channel is configured."
                : "Channel is not configured on the plant server."
            }
          />
          <Tick
            checked={settings.destinations.telegram}
            onChange={(v) => patch("destinations", "telegram", v)}
            label="Telegram"
            hint={
              telegram?.linked
                ? "Private chat is bound. Submit and day notes can post here."
                : "Waiting for a private message to @Office3331bot."
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Tick
            checked={settings.events.roundSubmit}
            onChange={(v) => patch("events", "roundSubmit", v)}
            label="Round submit"
            hint="After a round is saved on the plant server."
          />
          <Tick
            checked={settings.events.dayNotes}
            onChange={(v) => patch("events", "dayNotes", v)}
            label="Day notes"
            hint="Include the Summary day notes in the submit message."
          />
          <Tick
            checked={settings.events.locationCheckIn}
            onChange={(v) => patch("events", "locationCheckIn", v)}
            label="Location check-in"
            hint="Technician 15-minute slot, only on the location channel."
          />
          <Tick
            checked={settings.when.submitImmediate}
            onChange={(v) => patch("when", "submitImmediate", v)}
            label="Send immediately on submit"
            hint="If off, a saved round is not posted until you turn this back on."
          />
          <Tick
            checked={settings.when.locationOnSlot}
            onChange={(v) => patch("when", "locationOnSlot", v)}
            label="Location on the 15-minute slot"
            hint="Duty window still applies. Duplicate slots are not posted twice."
          />
          <Tick
            checked={settings.when.onlyIfFaults}
            onChange={(v) => patch("when", "onlyIfFaults", v)}
            label="Only if faults"
            hint="Skip Discord reports and Telegram when the round has no FAIL items."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What to send</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Tick
            checked={settings.payload.fullForm}
            onChange={(v) => patch("payload", "fullForm", v)}
            label="Full form"
            hint="Same layout as the in-app record."
          />
          <Tick
            checked={settings.payload.faultsOnly}
            onChange={(v) => patch("payload", "faultsOnly", v)}
            label="Faults only"
          />
          <Tick
            checked={settings.payload.photos}
            onChange={(v) => patch("payload", "photos", v)}
            label="Photos"
          />
          <Tick
            checked={settings.payload.pdf}
            onChange={(v) => patch("payload", "pdf", v)}
            label="PDF"
          />
          <Tick
            checked={settings.payload.satelliteImage}
            onChange={(v) => patch("payload", "satelliteImage", v)}
            label="Satellite image"
            hint="Esri World Imagery snapshot on location check-in."
          />
          <Tick
            checked={settings.payload.coords}
            onChange={(v) => patch("payload", "coords", v)}
            label="Coordinates"
          />
          <Tick
            checked={settings.payload.name}
            onChange={(v) => patch("payload", "name", v)}
            label="Name"
          />
          <Tick
            checked={settings.payload.time}
            onChange={(v) => patch("payload", "time", v)}
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
            Posts a short control-page test. No token, webhook, or server address is included.
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
          {saving ? "Saving…" : dirty ? "Save controls" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
