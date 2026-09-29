import { redirect } from "next/navigation";
import { NotificationsAdmin } from "@/components/notifications-admin";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <NotificationsAdmin />
    </main>
  );
}
