import type { CommonGroup, CommonItem, DayCatalogue, Equipment, RunningParam } from "@/lib/types";
import { newCommonItemId, newEquipmentId, newGroupId, newParamId } from "@/lib/validate";

function cloneParams(params: RunningParam[], used: Set<string>): RunningParam[] {
  return params.map((p) => {
    const id = newParamId(p.label, used);
    used.add(id);
    return { ...p, id };
  });
}

export function cloneAreaContents(source: DayCatalogue, labels?: Partial<DayCatalogue>): DayCatalogue {
  const usedEq = new Set<string>();
  const usedGrp = new Set<string>();
  const usedCm = new Set<string>();
  const usedParam = new Set<string>();
  return {
    label: labels?.label ?? source.label,
    formLabel: labels?.formLabel ?? source.formLabel,
    badge: labels?.badge ?? source.badge,
    blurb: labels?.blurb ?? source.blurb,
    equip: source.equip.map((e) => {
      const id = newEquipmentId(e.tag, usedEq);
      usedEq.add(id);
      return {
        ...e,
        id,
        runningParams: cloneParams(e.runningParams ?? [], usedParam),
        runningChecks: [...(e.runningChecks ?? [])],
        stoppedChecks: [...(e.stoppedChecks ?? [])],
      } satisfies Equipment;
    }),
    common: source.common.map((g) => {
      const id = newGroupId(g.name, usedGrp);
      usedGrp.add(id);
      return {
        ...g,
        id,
        items: g.items.map((item) => {
          const itemId = newCommonItemId(item.tag, usedCm);
          usedCm.add(itemId);
          return { ...item, id: itemId } satisfies CommonItem;
        }),
      } satisfies CommonGroup;
    }),
  };
}
