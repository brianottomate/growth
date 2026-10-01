import "server-only";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { ChatTurnError } from "./chat-turn.service";

export async function chatActor() {
  const session = await getSession();
  if (!session?.user) throw new ChatTurnError("Unauthorized", 401);
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
  if (memberships.length !== 1)
    throw new ChatTurnError("Select an organization", 403);
  return {
    userId: session.user.id,
    organizationId: memberships[0]!.organizationId,
  };
}
