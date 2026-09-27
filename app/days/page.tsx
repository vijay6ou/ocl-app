import { redirect } from "next/navigation";
import { PlantTree } from "@/components/plant-tree";
import { getCurrentUser } from "@/lib/auth";
import { filterCatalogueForUser } from "@/lib/hierarchy";
import { getCatalogue } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const catalogue = filterCatalogueForUser(user, await getCatalogue());
  return (
    <main className="w-full flex-1">
      <PlantTree catalogue={catalogue} user={user} mode="log" />
    </main>
  );
}
