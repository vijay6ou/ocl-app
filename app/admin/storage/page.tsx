import { redirect } from "next/navigation";
import { StorageAdmin } from "@/components/storage-admin";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <StorageAdmin />
    </main>
  );
}
