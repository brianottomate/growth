import "server-only";

import { getSession } from "@/server/better-auth/server";
import { getWanderMembership } from "@/server/wander-workspace";

export class WorkspaceAccessError extends Error {
  override name = "WorkspaceAccessError";
}

/** Resolve Wander directly and re-check live membership on every request. */
export async function resolveWorkspaceOrganizationId(input: {
  userId: string;
  preferredOrganizationId?: string | null;
}) {
  const membership = await getWanderMembership(input.userId);
  if (!membership)
    throw new WorkspaceAccessError("You do not have access to Wander Growth");
  return membership.organizationId;
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
