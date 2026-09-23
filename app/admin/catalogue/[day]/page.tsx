import { notFound, redirect } from "next/navigation";
import { CatalogueDayEditor } from "@/components/catalogue-admin";
import { getCurrentUser } from "@/lib/auth";
import { isDayKey } from "@/lib/validate";

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
  if (!isDayKey(day)) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <CatalogueDayEditor day={day} />
    </main>
  );
}
