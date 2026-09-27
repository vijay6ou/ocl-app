import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChecklistForm } from "@/components/checklist-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { canSeeArea, canonicalAreaId, WEEKDAY_TO_AREA } from "@/lib/hierarchy";
import { isSafeSectionId } from "@/lib/section-ids";
import { getCatalogue } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LogPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { day } = await params;
  if (!isSafeSectionId(day)) notFound();
  const mapped = WEEKDAY_TO_AREA[day];
  if (mapped && mapped !== day) redirect(`/log/${mapped}`);
  const id = canonicalAreaId(day);
  const catalogue = await getCatalogue();
  if (!catalogue.days[id]) notFound();
  if (!canSeeArea(user, catalogue, id)) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 md:max-w-4xl md:py-6">
      <Button variant="ghost" size="sm" className="mb-2 print:hidden" render={<Link href="/days" />}>
        ← Plant tree
      </Button>
      <ChecklistForm day={id} initialCatalogue={catalogue} />
    </main>
  );
}
