import { redirect } from "next/navigation";
import { BlockLibraryAdmin } from "@/components/block-library-admin";
import { getCurrentUser } from "@/lib/auth";
import { getBlocks } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  const blocks = await getBlocks();
  return (
    <main className="w-full flex-1">
      <BlockLibraryAdmin initial={blocks} />
    </main>
  );
}
