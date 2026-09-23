import "server-only";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";

export async function workspaceActor() {
  const session = await getSession();
  if (!session?.user) return null;
  const active = session.session.activeOrganizationId;
  const memberships = await db
    .select({ organizationId: memberTable.organizationId })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.userId, session.user.id),
        active ? eq(memberTable.organizationId, active) : undefined,
      ),
    )
    .limit(2);
  if (memberships.length !== 1) return null;
  return { orgId: memberships[0]!.organizationId, userId: session.user.id };
}
