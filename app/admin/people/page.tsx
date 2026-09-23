import { redirect } from "next/navigation";
import { PeopleAdmin } from "@/components/people-admin";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <PeopleAdmin />
    </main>
  );
}
