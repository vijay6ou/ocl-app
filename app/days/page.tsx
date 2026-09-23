import { redirect } from "next/navigation";
import { DaysGrid } from "@/components/days-grid";
import { getCurrentUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const catalogue = await getCatalogue();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <DaysGrid catalogue={catalogue} />
    </main>
  );
}
