"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoCapture } from "@/components/photo-capture";
import type { PhotoRef } from "@/lib/types";

export type SubmitAuth = { selfieId?: string; pin?: string };

export function SubmitGate({
  submitting,
  onCancel,
  onConfirm,
}: {
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (args: SubmitAuth) => void;
}) {
  const [method, setMethod] = useState<"selfie" | "pin">("selfie");
  const [selfies, setSelfies] = useState<PhotoRef[]>([]);
  const [pin, setPin] = useState("");
  const selfie = selfies[0];
  const pinOk = /^\d{4}$/.test(pin);
  const ready =
    !submitting && (method === "selfie" ? Boolean(selfie) : pinOk);

  function chooseMethod(next: "selfie" | "pin") {
    setMethod(next);
    if (next === "selfie") setPin("");
    else setSelfies([]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="submit-gate-title"
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
      >
        <h2 id="submit-gate-title" className="font-heading text-xl font-semibold">
          Confirm submit
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Authenticate with a front-camera selfie or your 4-digit PIN — one is
          enough. Do not use both.
        </p>

        <div
          role="tablist"
          aria-label="Confirm with selfie or PIN"
          className="mt-4 grid grid-cols-2 gap-2"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={method === "selfie"}
            variant={method === "selfie" ? "default" : "outline"}
            className="h-11"
            disabled={submitting}
            onClick={() => chooseMethod("selfie")}
          >
            Selfie
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={method === "pin"}
            variant={method === "pin" ? "default" : "outline"}
            className="h-11"
            disabled={submitting}
            onClick={() => chooseMethod("pin")}
          >
            4-digit PIN
          </Button>
        </div>

        {method === "selfie" ? (
          <div className="mt-4 space-y-2">
            <Label>Front-camera selfie</Label>
            <PhotoCapture
              photos={selfies}
              kind="selfie"
              facing="user"
              gallery={false}
              label={selfie ? "Retake selfie" : "Take selfie"}
              hint="Uses the front camera only. Gallery is not allowed."
              onChange={setSelfies}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="submit-pin">4-digit PIN</Label>
            <Input
              id="submit-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-12 tracking-[0.4em] text-center text-lg"
              placeholder="••••"
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            size="lg"
            className="h-12 flex-1"
            disabled={!ready}
            onClick={() => {
              if (method === "selfie") {
                if (!selfie) return;
                onConfirm({ selfieId: selfie.id });
                return;
              }
              if (!pinOk) return;
              onConfirm({ pin });
            }}
          >
            {submitting ? "Archiving…" : "Confirm and submit"}
          </Button>
          <Button variant="outline" className="h-12" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
