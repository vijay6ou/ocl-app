import { notFound, redirect } from "next/navigation";
import { CatalogueDayEditor } from "@/components/catalogue-admin";
import { getCurrentUser } from "@/lib/auth";
import { findArea, isSafeSectionId } from "@/lib/plant-structure";
import { getCatalogue } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CatalogueDayPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  const { day } = await params;
  if (!isSafeSectionId(day)) notFound();
  const catalogue = await getCatalogue();
  if (!catalogue.days[day]) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <CatalogueDayEditor
        day={day}
        initialSection={catalogue.days[day]}
        areaName={findArea(catalogue, day)?.name ?? "Plant area"}
      />
    </main>
  );
}
