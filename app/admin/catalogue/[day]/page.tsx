import { notFound, redirect } from "next/navigation";
import { CatalogueDayEditor } from "@/components/catalogue-admin";
import { getCurrentUser } from "@/lib/auth";
import { pathForArea } from "@/lib/hierarchy";
import { isSafeSectionId } from "@/lib/section-ids";
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
  const trail = pathForArea(catalogue, day);
  const areaName = [trail.plant?.name, trail.section?.name].filter(Boolean).join(" · ") || "Plant";
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <CatalogueDayEditor
        day={day}
        initialSection={catalogue.days[day]}
        areaName={areaName}
      />
    </main>
  );
}
