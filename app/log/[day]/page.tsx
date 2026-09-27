import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChecklistForm } from "@/components/checklist-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { isSafeSectionId } from "@/lib/plant-structure";
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
  const catalogue = await getCatalogue();
  if (!catalogue.days[day]) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 md:max-w-4xl md:py-6">
      <Button variant="ghost" size="sm" className="mb-2 print:hidden" render={<Link href="/days" />}>
        ← Plant sections
      </Button>
      <ChecklistForm day={day} initialCatalogue={catalogue} />
    </main>
  );
}
