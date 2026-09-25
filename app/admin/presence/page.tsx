import { redirect } from "next/navigation";
import { PresenceAdmin } from "@/components/presence-admin";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PresencePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <PresenceAdmin />
    </main>
  );
}
