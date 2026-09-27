"use client";

import { blockFamilies, type EquipmentBlock } from "@/lib/equipment-blocks";
import { Button } from "@/components/ui/button";

export function EquipmentBlockPicker({
  blocks,
  onPick,
  onBlank,
  onClose,
}: {
  blocks: EquipmentBlock[];
  onPick: (blockId: string) => void;
  onBlank: () => void;
  onClose: () => void;
}) {
  const families = blockFamilies(blocks);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Add an equipment block</h2>
            <p className="text-sm text-muted-foreground">
              Each block brings its readings and the checks for its internal parts. Edit the tag
              and name after it lands on the form.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-5 overflow-y-auto px-4 py-3">
          {families.map((group) => (
            <section key={group.family}>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.family}
              </h3>
              <div className="mt-2 grid gap-2">
                {group.blocks.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => onPick(block.id)}
                    className="rounded-lg border px-3 py-2 text-left hover:border-[#d4a017] hover:bg-[#d4a017]/10"
                  >
                    <span className="block text-sm font-medium">{block.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{block.summary}</span>
                    <span className="mt-1 block text-xs text-[#0d2137]">
                      Parts: {block.parts.join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">A blank card has no readings until you add them.</p>
          <Button variant="outline" onClick={onBlank}>
            Empty card
          </Button>
        </div>
      </div>
    </div>
  );
}
