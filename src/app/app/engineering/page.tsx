import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { getDataHealth } from "@/server/services/data-health.service";

import { EngineeringView } from "./EngineeringView";

// Always reflect live row counts — never cache.
export const dynamic = "force-dynamic";

/**
 * /app/engineering — a read-only data-health view on top of the database,
 * grouped by domain. Shows what's wired up vs. what looks weirdly empty.
 */
export default async function EngineeringPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const health = await getDataHealth();
  return <EngineeringView health={health} />;
}
