import { redirect } from "next/navigation";
import { UpdatePanel } from "@/components/update-panel";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UpdatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <h1 className="mb-4 font-heading text-2xl font-semibold">Update</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Check the plant server for a newer technician APK and install it on this phone. Updates
        are not delivered through Play Store.
      </p>
      <UpdatePanel />
    </main>
  );
}
