"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isOclNative } from "@/lib/print-native";
import { ANDROID_APP } from "@/lib/android-app";
import { looksSensitive, sanitizePublicText } from "@/lib/public-text";

type VersionInfo = {
  versionCode: number;
  versionName: string;
  url: string;
  notes: string;
  apkAvailable: boolean;
  apkBytes: number | null;
};

function safeNotes(notes: string | undefined) {
  if (!notes?.trim()) return "";
  if (looksSensitive(notes)) return "A newer technician app is on the plant server.";
  return notes;
}

export function UpdatePanel() {
  const [remote, setRemote] = useState<VersionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const installedName = (() => {
    try {
      return window.OCLNative?.appVersionName?.() ?? ANDROID_APP.versionName;
    } catch {
      return ANDROID_APP.versionName;
    }
  })();
  const installedCode = (() => {
    try {
      return window.OCLNative?.appVersionCode?.() ?? ANDROID_APP.versionCode;
    } catch {
      return ANDROID_APP.versionCode;
    }
  })();

  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/app/version", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not reach the plant server.");
      setRemote((await res.json()) as VersionInfo);
    } catch (err) {
      setError(
        sanitizePublicText(
          err instanceof Error ? err.message : "Could not check for updates.",
          "Could not check for updates."
        )
      );
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const newer = remote != null && remote.versionCode > installedCode && remote.apkAvailable;

  function install() {
    if (!remote?.url) return;
    try {
      if (isOclNative() && window.OCLNative?.installUpdate) {
        window.OCLNative.installUpdate(remote.url);
        return;
      }
    } catch {
      /* fall through */
    }
    window.location.href = "/api/app/ocl-maintenance.apk";
  }

  function nativeCheck() {
    try {
      if (isOclNative() && window.OCLNative?.checkUpdate) {
        window.OCLNative.checkUpdate();
        return;
      }
    } catch {
      /* fall through */
    }
    void load();
  }

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
          Technician app
        </p>
        <CardTitle>App update</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-[oklch(0.97_0.012_145)] p-3">
            <dt className="text-muted-foreground">This phone</dt>
            <dd className="font-heading text-lg font-semibold">
              {installedName}{" "}
              <span className="text-sm font-medium text-muted-foreground">(code {installedCode})</span>
            </dd>
          </div>
          <div className="rounded-xl bg-[oklch(0.97_0.012_145)] p-3">
            <dt className="text-muted-foreground">Plant server</dt>
            <dd className="font-heading text-lg font-semibold">
              {checking
                ? "Checking…"
                : remote
                  ? `${remote.versionName} (code ${remote.versionCode})`
                  : "Unavailable"}
            </dd>
          </div>
        </dl>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {remote && !newer ? (
          <p className="text-sm text-emerald-800">This is the latest technician app on the plant server.</p>
        ) : null}
        {newer ? (
          <p className="text-sm">{safeNotes(remote.notes) || "A newer technician app is on the plant server."}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={nativeCheck} disabled={checking}>
            <RefreshCw className={checking ? "animate-spin" : undefined} />
            Check for update
          </Button>
          {remote?.apkAvailable ? (
            <Button onClick={install} disabled={isOclNative() ? !newer : !remote?.apkAvailable}>
              <Download />
              {newer ? "Download and install" : "Download APK"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
