import "server-only";
import { eq } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";

export class WorkspaceAccessError extends Error {
  override name = "WorkspaceAccessError";
}

/**
 * The organization a signed-in person is acting in: the session's active
 * organization when they are still a member of it, otherwise their only
 * membership. Membership is read from the database, never trusted from the
 * session claim.
 */
export async function resolveWorkspaceOrganizationId(input: {
  userId: string;
  preferredOrganizationId?: string | null;
}) {
  const memberships = await db
    .select({ organizationId: memberTable.organizationId })
    .from(memberTable)
    .where(eq(memberTable.userId, input.userId));
  const preferred = input.preferredOrganizationId;
  if (preferred && memberships.some((m) => m.organizationId === preferred))
    return preferred;
  if (memberships.length === 1) return memberships[0]!.organizationId;
  throw new WorkspaceAccessError(
    memberships.length === 0
      ? "No organization membership found"
      : "Select an active organization first",
  );
}

export async function workspaceActor() {
  const session = await getSession();
  if (!session?.user) return null;
  try {
    const orgId = await resolveWorkspaceOrganizationId({
      userId: session.user.id,
      preferredOrganizationId: session.session.activeOrganizationId,
    });
    return { orgId, userId: session.user.id };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return null;
    throw error;
  }
}
