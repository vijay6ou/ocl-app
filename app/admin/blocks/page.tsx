import { redirect } from "next/navigation";
import { BlockLibraryAdmin } from "@/components/block-library-admin";
import { getCurrentUser } from "@/lib/auth";
import { getBlocks, getSuperBlocks } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/days");
  const [blocks, superBlocks] = await Promise.all([getBlocks(), getSuperBlocks()]);
  return (
    <main className="w-full flex-1">
      <BlockLibraryAdmin initial={blocks} initialSuper={superBlocks} />
    </main>
  );
}
