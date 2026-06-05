import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { LeadsClient } from "./LeadsClient";

export default async function LeadsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  return <LeadsClient />;
}
