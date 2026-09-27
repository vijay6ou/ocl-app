import { redirect } from "next/navigation";
import { EodDesk } from "@/components/eod-desk";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EodPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main className="w-full flex-1">
      <EodDesk />
    </main>
  );
}
