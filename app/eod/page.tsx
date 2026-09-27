import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Day notes live on the round, just before submit — not a separate page. */
export default function EodRedirect() {
  redirect("/days");
}
