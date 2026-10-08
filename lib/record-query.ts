import { canSeeArea, canonicalAreaId } from "@/lib/hierarchy";
import { isSafeSectionId } from "@/lib/section-ids";
import { getCatalogue, listSubmissions } from "@/lib/store";
import { defaultHistoryRange, recordInDateRange } from "@/lib/submit-time";
import type { PublicUser, Submission } from "@/lib/types";

export function historyFilterFrom(url: URL) {
  const range = defaultHistoryRange();
  const from = (url.searchParams.get("from") ?? "").trim() || range.from;
  const to = (url.searchParams.get("to") ?? "").trim() || range.to;
  return {
    q: (url.searchParams.get("q") ?? "").trim().toLowerCase(),
    day: url.searchParams.get("day") ?? "",
    shift: url.searchParams.get("shift") ?? "",
    from,
    to,
    failures: url.searchParams.get("failures") === "1",
  };
}

export async function queryVisibleSubmissions(
  user: PublicUser,
  filter: ReturnType<typeof historyFilterFrom>
): Promise<Submission[]> {
  let rows = await listSubmissions();
  const catalogue = await getCatalogue();
  if (user.role !== "admin") {
    rows = rows.filter((r) => canSeeArea(user, catalogue, r.meta.day));
  }
  rows = rows.filter((r) => recordInDateRange(r, filter.from, filter.to));
  if (filter.day && isSafeSectionId(filter.day)) {
    rows = rows.filter((r) => canonicalAreaId(r.meta.day) === canonicalAreaId(filter.day));
  }
  if (filter.shift) rows = rows.filter((r) => r.meta.shift === filter.shift);
  if (filter.failures) rows = rows.filter((r) => r.fails.length > 0);
  if (filter.q) {
    rows = rows.filter((r) => {
      const hay = [
        r.meta.tech,
        r.meta.sup,
        r.meta.dayLabel,
        r.meta.form,
        r.id,
        ...r.fails.map((f) => `${f.equipment} ${f.issue}`),
        ...Object.values(r.equip).map((e) => e.remarks),
        r.dayNotes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(filter.q);
    });
  }
  return rows;
}
