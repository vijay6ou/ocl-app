import { redirect } from "next/navigation";
import { CatalogueHome } from "@/components/catalogue-admin";
import { getCurrentUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  const catalogue = await getCatalogue();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <CatalogueHome initial={catalogue} />
    </main>
  );
}
