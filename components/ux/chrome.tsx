"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isAdmin, viewer } from "@/lib/ux-mock";
import { useUx } from "@/components/ux/store";

const SAMPLES = [
  { href: "/ux/tree", code: "A", label: "Plant tree" },
  { href: "/ux/cards", code: "B", label: "Step by step" },
  { href: "/ux/board", code: "C", label: "Coverage board" },
];

export function UxChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, dispatch } = useUx();
  const me = viewer(state);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
        Prototype only — nothing is saved. Try each layout, then tell us A, B, or C.
      </div>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[oklch(0.28_0.06_155)] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
          <Link href="/ux" className="mr-2 font-heading text-sm tracking-wide">
            UX samples
          </Link>
          <nav className="flex flex-wrap gap-1">
            {SAMPLES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm text-white/80 hover:bg-white/10",
                  pathname === s.href ? "bg-white/15 text-white" : ""
                )}
              >
                <span className="font-heading">{s.code}</span> {s.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <span className="mr-1 hidden text-[11px] text-white/60 sm:inline">View as</span>
            {state.people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => dispatch({ type: "view", id: p.id })}
                className={cn(
                  "rounded-md px-2 py-1 text-xs",
                  state.viewerId === p.id ? "bg-white text-primary" : "bg-white/10 text-white/80"
                )}
              >
                {p.name}
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={() => dispatch({ type: "reset" })}
            >
              Reset
            </Button>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-1.5 text-center text-[11px] text-white/70">
          {isAdmin(state)
            ? "Admin sees every plant, the block library, and who is assigned."
            : `${me.name} only sees assigned plants, sections, and areas. Ramesh has all of Material handling. Suresh has Additive and Gypsum.`}
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
