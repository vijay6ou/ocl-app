"use client";

import { cn } from "@/lib/utils";
import type { CheckResult } from "@/lib/types";

export function OkFailToggle({
  value,
  onChange,
}: {
  value: CheckResult;
  onChange: (next: CheckResult) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5">
      <button
        type="button"
        className={cn(
          "min-h-8 min-w-12 rounded-md px-2.5 text-xs font-semibold",
          value === "ok"
            ? "bg-emerald-700 text-white"
            : "text-muted-foreground hover:bg-muted"
        )}
        onClick={() => onChange(value === "ok" ? null : "ok")}
      >
        OK
      </button>
      <button
        type="button"
        className={cn(
          "min-h-8 min-w-12 rounded-md px-2.5 text-xs font-semibold",
          value === "fail"
            ? "bg-red-700 text-white"
            : "text-muted-foreground hover:bg-muted"
        )}
        onClick={() => onChange(value === "fail" ? null : "fail")}
      >
        FAIL
      </button>
    </div>
  );
}

export function RunStopToggle({
  value,
  onChange,
}: {
  value: "R" | "S" | null;
  onChange: (next: "R" | "S" | null) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border bg-background p-0.5"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          "min-h-8 rounded-md px-2 text-xs font-semibold sm:px-3",
          value === "R"
            ? "bg-emerald-700 text-white"
            : "text-muted-foreground hover:bg-muted"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onChange(value === "R" ? null : "R");
        }}
      >
        RUNNING
      </button>
      <button
        type="button"
        className={cn(
          "min-h-8 rounded-md px-2 text-xs font-semibold sm:px-3",
          value === "S"
            ? "bg-amber-600 text-white"
            : "text-muted-foreground hover:bg-muted"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onChange(value === "S" ? null : "S");
        }}
      >
        STOPPED
      </button>
    </div>
  );
}
