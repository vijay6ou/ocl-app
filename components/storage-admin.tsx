"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import { defaultHistoryRange } from "@/lib/submit-time";

type Usage = {
  dataBytes: number;
  uploadsBytes: number;
  mediaBytes?: number;
  otherBytes: number;
  submissionsBytes: number;
  photosIndexBytes: number;
  locationsBytes: number;
  submissionCount: number;
  photoCount: number;
};

type TelegramStatus = {
  configured: boolean;
  linked: boolean;
  botUsername: string;
  lastError?: string;
  lastDiscoverAt?: string;
  lastSentAt?: string;
};

type Preview = {
  submissionCount: number;
  photoCount: number;
  from: string;
  to: string;
} | null;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StorageAdmin() {
  const range = defaultHistoryRange();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (dates?: { from: string; to: string }) => {
      setLoading(true);
      setError(null);
      try {
        const q = dates ?? { from, to };
        const [data, tg] = await Promise.all([
          api<{ usage: Usage; preview: Preview }>(
            `/api/admin/storage?from=${encodeURIComponent(q.from)}&to=${encodeURIComponent(q.to)}`
          ),
          api<{ telegram: TelegramStatus }>("/api/admin/telegram").catch(() => null),
        ]);
        setUsage(data.usage);
        setPreview(data.preview);
        if (tg?.telegram) setTelegram(tg.telegram);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read plant storage.");
      } finally {
        setLoading(false);
      }
    },
    [from, to]
  );

  useEffect(() => {
    void load();
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDelete(e: FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        `Delete saved rounds and their photos from ${from} through ${to}? Catalogue and people stay.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const data = await api<{
        result: { deletedSubmissions: number; deletedPhotos: number };
        usage: Usage;
      }>("/api/admin/storage", {
        method: "DELETE",
        body: JSON.stringify({ from, to, confirm: confirmText }),
      });
      setUsage(data.usage);
      setConfirmText("");
      toast.success(
        `Removed ${data.result.deletedSubmissions} records and ${data.result.deletedPhotos} photos.`
      );
      await load({ from, to });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete those records.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !usage) return <LoadingState label="Measuring plant storage…" />;
  if (error && !usage) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!usage) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Plant storage</h1>
        <p className="text-sm text-muted-foreground">
          Disk used by saved rounds, photos, and location check-ins on the plant server. Equipment
          albums under plant → section → area stay when you delete old rounds. Catalogue and people
          are not included in date-range delete.
        </p>
      </div>

      <Card data-telegram-status>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {telegram ? (
            <>
              <p>
                Bot <span className="font-medium">@{telegram.botUsername || "Office3331bot"}</span>
                {telegram.configured ? " is configured on the plant server." : " token is missing on the plant server."}{" "}
                {telegram.linked
                  ? "A private chat is linked. Submit and day notes post here."
                  : "Waiting for a private message to @Office3331bot. Open that chat and send any text, then tap Check for a DM."}
              </p>
              {telegram.lastError ? (
                <p className="text-amber-800">{telegram.lastError}</p>
              ) : null}
              {telegram.lastSentAt ? (
                <p className="text-muted-foreground">Last send {telegram.lastSentAt.slice(0, 16).replace("T", " ")} UTC</p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Could not read Telegram status.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={telegramBusy}
              onClick={async () => {
                setTelegramBusy(true);
                try {
                  const data = await api<{ telegram: TelegramStatus }>("/api/admin/telegram", {
                    method: "POST",
                    body: JSON.stringify({ test: false }),
                  });
                  setTelegram(data.telegram);
                  toast.success(
                    data.telegram.linked
                      ? "Private chat is linked."
                      : "Still waiting for a DM to @Office3331bot."
                  );
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not check Telegram.");
                } finally {
                  setTelegramBusy(false);
                }
              }}
            >
              {telegramBusy ? "Checking…" : "Check for a DM"}
            </Button>
            <Button
              type="button"
              disabled={telegramBusy || !telegram?.linked}
              onClick={async () => {
                setTelegramBusy(true);
                try {
                  const data = await api<{ telegram: TelegramStatus; testSent?: boolean }>(
                    "/api/admin/telegram",
                    { method: "POST", body: JSON.stringify({ test: true }) }
                  );
                  setTelegram(data.telegram);
                  toast.success(data.testSent ? "Test message sent." : "Could not send a test yet.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not send a test.");
                } finally {
                  setTelegramBusy(false);
                }
              }}
            >
              Send test
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-storage-usage>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">All plant data</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-2xl font-semibold">
            {fmtBytes(usage.dataBytes)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Photo files</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-2xl font-semibold">
            {fmtBytes((usage.mediaBytes ?? 0) + usage.uploadsBytes)}
            <p className="mt-1 text-xs font-normal text-muted-foreground">
              {usage.photoCount} photos · plant folders {fmtBytes(usage.mediaBytes ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Records index</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-2xl font-semibold">
            {fmtBytes(usage.submissionsBytes)}
            <p className="mt-1 text-xs font-normal text-muted-foreground">
              {usage.submissionCount} rounds
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Other JSON</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-2xl font-semibold">
            {fmtBytes(usage.otherBytes)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delete records between dates</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onDelete}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from">From (inclusive)</Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To (inclusive)</Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {preview
                ? `${preview.submissionCount} rounds and ${preview.photoCount} photos would be removed.`
                : "Choose dates, then preview."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void load({ from, to })}>
                Preview
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Type DELETE to confirm</Label>
              <Input
                id="confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="destructive" disabled={busy || confirmText !== "DELETE"}>
              {busy ? "Deleting…" : "Delete records in this range"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
