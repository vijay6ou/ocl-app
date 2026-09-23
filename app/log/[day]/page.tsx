import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChecklistForm } from "@/components/checklist-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/store";
import { isDayKey } from "@/lib/validate";

export const dynamic = "force-dynamic";

export default async function LogPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { day } = await params;
  if (!isDayKey(day)) notFound();
  const catalogue = await getCatalogue();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 md:max-w-4xl md:py-6">
      <Button variant="ghost" size="sm" className="mb-2 print:hidden" render={<Link href="/days" />}>
        ← Days
      </Button>
      <ChecklistForm day={day} initialCatalogue={catalogue} />
    </main>
  );
}
