import { redirect } from "next/navigation";
import { FilesAlbum } from "@/components/files-album";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main className="w-full flex-1">
      <FilesAlbum />
    </main>
  );
}
