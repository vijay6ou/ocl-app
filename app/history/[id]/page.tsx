import { notFound, redirect } from "next/navigation";
import { RecordView } from "@/components/record-view";
import { getCurrentUser } from "@/lib/auth";
import { getSubmission } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) notFound();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <RecordView id={id} initial={submission} />
    </main>
  );
}
