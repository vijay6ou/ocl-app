"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";

const HEARTBEAT_MS = 30_000;

export function PresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    function beat() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void api("/api/presence", { method: "POST" }).catch(() => undefined);
    }

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  return null;
}
