import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { OverviewChat } from "./OverviewChat";

/**
 * /overview — a temporary chat surface for the growth back-office assistant.
 * Intended to grow into the app's home screen (replacing the /app dashboard)
 * and, later, an MCP surface. The chat agent lives at /api/overview/chat.
 */
export default async function OverviewPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    columns: { organizationId: true },
  });
  if (!membership?.organizationId) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  return <OverviewChat userName={session.user.name ?? session.user.email ?? "there"} />;
}
