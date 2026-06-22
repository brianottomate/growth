import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { SendReviewClient } from "./SendReviewClient";

export default async function SendReviewPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  return <SendReviewClient />;
}
